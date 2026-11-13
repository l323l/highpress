import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowsClockwiseIcon } from '../../components/icons'
import { clubOf, clubsIn, clubTheme } from '../../lib/clubs'
import { toHash } from '../../lib/router'
import { AccountBar, canSync, useAccount } from '../account'
import { displayName, isOnline } from './helpers'
import { LoginNote } from './LoginNote'
import { PostCard } from './PostCard'
import { ClubRail, PopularRail, RingAvatar } from './Rails'
import { getFeedRemote } from './remote'
import type { FeedPost, FeedSort, FoundPerson } from '@highpress/core/feed'
import { usePosts } from './usePosts'
import './feed.css'

interface ListProps {
  posts: FeedPost[] | null
  // 로그인한 사용자의 id. 로그인하지 않았으면 빈 글자.
  me: string
  // 글쓴이를 눌러 프로필로 갈 수 있다. 프로필 화면에서는 끈다.
  linkAuthor?: boolean
  onLike: (post: FeedPost) => void
  onRemove: (post: FeedPost) => void
  // 글쓴이를 차단했다. 목록을 새로 읽는다.
  onBlocked?: (userId: string) => void
}

// 글 목록. 홈 피드와 프로필 화면이 함께 쓴다.
export function PostList({ posts, me, linkAuthor = true, onLike, onRemove, onBlocked }: ListProps) {
  if (posts === null) {
    return (
      <div className="post post-skeleton" role="status" aria-label="피드를 불러오는 중">
        <span />
        <span />
        <span />
      </div>
    )
  }
  return (
    <>
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} me={me} index={index} linkAuthor={linkAuthor} onLike={onLike} onRemove={onRemove} onBlocked={onBlocked} />
      ))}
    </>
  )
}

interface FeedProps {
  // 맨 위 검색창에 적은 말. 비어 있으면 거르지 않는다.
  query?: string
  onClearQuery?: () => void
}

// 검색어에 맞는 칼럼리스트. 누르면 그 사람의 프로필로 간다.
function FoundPeople({ query }: { query: string }) {
  const [people, setPeople] = useState<FoundPerson[]>([])

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.searchPeople(query) : []))
      .catch(() => [] as FoundPerson[])
      .then((found) => {
        if (!cancelled) setPeople(found)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  if (people.length === 0) return null
  return (
    <ul className="found" aria-label="찾은 칼럼리스트">
      {people.map((person) => (
        <li key={person.userId}>
          <a className="found-item" href={toHash({ name: 'profile', id: person.userId })}>
            <RingAvatar name={person.nickname} size={36} fresh={person.fresh} online={isOnline(person)} src={person.avatar} />
            <span className="found-text">
              <strong>{displayName(person.nickname)}</strong>
              <span className="muted">칼럼 {person.postCount}편</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Feed({ me, query = '', onClearQuery }: FeedProps & { me: string }) {
  // 리그를 고르면 그 리그 구단들의 글을, 그 안에서 구단을 고르면 그 구단의 글만 본다.
  const [league, setLeague] = useState<string | null>(null)
  const [club, setClub] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [sort, setSort] = useState<FeedSort>('new')
  const [reloads, setReloads] = useState(0)
  // 로그인하지 않은 사람이 로그인해야 하는 일을 눌렀을 때 띄우는 안내 (무엇을 하려 했는지)
  const [ask, setAsk] = useState('')
  const leagueClubs = league && !club ? clubsIn(league).map((item) => item.id) : null
  const { posts, more, error, denied, loadMore, like, remove } = usePosts({ club, clubs: leagueClubs, following, query, sort }, reloads)

  const picked = clubOf(club)
  // 고른 범위의 이름: 구단을 골랐으면 구단, 아니면 리그.
  const place = picked ? picked.name : league
  const scope = [query ? `“${query}”` : null, following ? '팔로잉' : null, place].filter(Boolean).join(' · ')

  const pickLeague = (next: string | null) => {
    setLeague(next)
    setClub(null)
  }

  const scopeButton = (value: boolean, label: string) => (
    <button type="button" aria-pressed={following === value} onClick={() => (value && !me ? setAsk('팔로잉 모아 보기는') : setFollowing(value))}>
      {label}
    </button>
  )

  // 구단을 고르면 배경이 그 구단의 색으로 물든다.
  const theme = picked ? clubTheme(picked) : null
  const tint = (theme ? { '--tint-a': theme.a, '--tint-b': theme.b } : undefined) as CSSProperties | undefined

  const sortButton = (value: FeedSort, label: string) => (
    <button type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>
      {label}
    </button>
  )

  // 서버가 아직 읽기를 열지 않았으면(0009_public_read.sql 전) 로그인하지 않은 사람에게는 예전처럼 로그인 안내를 보여 준다.
  if (!me && denied) return <Gate />

  return (
    <div className="feed-layout" data-club={picked?.id} style={tint}>
      <div className="club-tint" aria-hidden="true" />
      <ClubRail league={league} club={club} onLeague={pickLeague} onClub={setClub} />

      <div className="feed">
        <div className="feed-bar">
          <div className="seg" role="group" aria-label="보는 범위">
            {scopeButton(false, '전체')}
            {scopeButton(true, '팔로잉')}
          </div>
          <p className="muted" role="status">
            {scope ? `${scope} 칼럼만 보는 중` : '가입한 사람들이 올린 칼럼'}
          </p>
          {query && onClearQuery && (
            <button type="button" className="btn btn-ghost" onClick={onClearQuery}>
              검색 지우기
            </button>
          )}
          <div className="seg feed-sort" role="group" aria-label="늘어놓는 순서">
            {sortButton('new', '최신')}
            {sortButton('top', '좋아요순')}
          </div>
          <button type="button" className="icon-btn" aria-label="피드 새로 고침" title="새로 고침" onClick={() => setReloads((n) => n + 1)}>
            <ArrowsClockwiseIcon size={18} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p className="feed-error" role="alert">
            {error}
          </p>
        )}

        {ask && <LoginNote what={ask} onClose={() => setAsk('')} />}

        {query && <FoundPeople query={query} />}

        {posts !== null && posts.length === 0 && !error && (
          <div className="feed-empty">
            {query ? (
              <>
                <h2>“{query}”에 맞는 칼럼이 없습니다</h2>
                <p className="muted">제목, 글의 앞부분, 글쓴이 이름에서 찾습니다. 다른 말로 찾아보거나 검색을 지워 주세요.</p>
              </>
            ) : following ? (
              <>
                <h2>팔로우한 사람의 칼럼이 아직 없습니다</h2>
                <p className="muted">칼럼리스트의 프로필에서 팔로우를 누르면 그 사람의 글이 여기에 모입니다.</p>
              </>
            ) : place ? (
              <>
                <h2>{place} 칼럼이 아직 없습니다</h2>
                <p className="muted">피드에 올릴 때 구단을 고르면 이 목록에 들어갑니다.</p>
              </>
            ) : (
              <>
                <h2>아직 올라온 칼럼이 없습니다</h2>
                <p className="muted">글쓰기 화면이나 내 칼럼에서 “피드에 올리기”를 누르면 여기에 보입니다. 글과 스탯 표, 고른 대표 사진 한 장만 공개되고 나머지 사진과 영상은 올라가지 않습니다.</p>
              </>
            )}
          </div>
        )}

        <PostList posts={posts} me={me} onLike={(target) => (me ? void like(target) : setAsk('좋아요는'))} onRemove={(target) => void remove(target)} onBlocked={() => setReloads((n) => n + 1)} />

        {more && posts && posts.length > 0 && (
          <button type="button" className="btn feed-more" onClick={() => void loadMore()}>
            더 보기
          </button>
        )}
      </div>

      <PopularRail me={me} reloads={reloads} />
    </div>
  )
}

function Gate() {
  return (
    <div className="feed feed--gate">
      <div className="feed-empty">
        <h2>칼럼 피드</h2>
        <p className="muted">가입한 사람들이 올린 칼럼을 읽고 좋아요와 댓글을 남길 수 있습니다. 지금은 로그인해야 볼 수 있습니다.</p>
      </div>
      <AccountBar />
    </div>
  )
}

// 홈 화면의 피드 탭. 읽기는 누구나 하고, 좋아요 · 댓글 · 팔로우 · 글 올리기는 로그인하고 약관에 동의한 사람만 한다.
export function FeedPane({ query, onClearQuery }: FeedProps = {}) {
  const account = useAccount()
  // 계정을 확인하는 동안에는 기다린다. 로그인한 사람의 피드를 손님 것으로 한 번 더 읽지 않게.
  if (account.status === 'loading') {
    return (
      <div className="feed">
        <PostList posts={null} me="" onLike={() => undefined} onRemove={() => undefined} />
      </div>
    )
  }
  const me = account.status === 'in' && canSync(account) ? account.userId : ''
  // 로그인하거나 로그아웃하면 처음부터 다시 읽는다 (내가 누른 좋아요 표시가 달라진다).
  return <Feed key={me} me={me} query={query?.trim()} onClearQuery={onClearQuery} />
}
