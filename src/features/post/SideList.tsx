import { useEffect, useId, useState } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { clubOf } from '../../lib/clubs'
import { toHash } from '../../lib/router'
import { useAccount } from '../account'
import { openLogin } from '../account/loginPrompt'
import { Avatar, displayName, getFeedRemote, PostCover, timeAgo, type FeedPost } from '../feed'
import { AuthorCard } from './AuthorCard'

// 묶음마다 보여 주는 글 수. 한 묶음이 자리를 다 차지하지 않게 적게 둔다.
const AUTHOR_COUNT = 3
const HOT_COUNT = 3
const RECENT_COUNT = 5

function Item({ post }: { post: FeedPost }) {
  const club = clubOf(post.club)
  return (
    <li>
      <a className="side-item" href={toHash({ name: 'post', author: post.userId, id: post.id })}>
        <span className="side-by">
          {/* 구단을 고른 글은 구단 표시가, 아니면 글쓴이의 첫 글자가 앞에 선다. */}
          {club ? <ClubBadge club={club} size={24} /> : <Avatar name={post.nickname} size={24} src={post.avatar} />}
          <strong>{displayName(post.nickname)}</strong>
          <time className="muted" dateTime={new Date(post.createdAt).toISOString()}>
            {timeAgo(post.createdAt)}
          </time>
        </span>
        <span className="side-title">{post.title}</span>
        <span className="side-meta muted">
          좋아요 {post.likeCount}개 · 댓글 {post.commentCount}개
        </span>
        {post.cover && (
          <span className="side-thumb">
            <PostCover path={post.cover} title={post.title} />
          </span>
        )}
      </a>
    </li>
  )
}

function Group({ title, posts }: { title: string; posts: FeedPost[] }) {
  const id = useId()
  if (posts.length === 0) return null
  return (
    <section className="side-group" aria-labelledby={id}>
      <h2 id={id} className="side-heading">
        {title}
      </h2>
      <ul className="side-list">
        {posts.map((post) => (
          <Item key={post.id} post={post} />
        ))}
      </ul>
    </section>
  )
}

// 로그인하지 않은 사람에게: 가입하면 무엇을 할 수 있는지와 로그인 단추.
function JoinPanel() {
  return (
    <section className="join" aria-labelledby="join-title">
      <h2 id="join-title" className="join__title">
        축구를 글로 푸는 사람들의 자리
      </h2>
      <p className="join__text">가입하면 좋아요와 댓글을 남기고, 전술판과 스탯을 넣은 칼럼을 써서 피드에 올릴 수 있습니다.</p>
      <button type="button" className="btn btn-primary join__button" onClick={openLogin}>
        로그인 · 가입
      </button>
      <p className="join__terms muted">
        가입할 때 <a href="#/terms">이용약관</a>과 <a href="#/privacy">개인정보처리방침</a>에 동의합니다.
      </p>
    </section>
  )
}

interface Props {
  // 로그인한 사용자의 id. 로그인하지 않았으면 빈 글자.
  me: string
  // 지금 읽는 글과 그 글쓴이
  current: string
  author: string
}

// 글 화면의 오른쪽: 글쓴이, 그 사람의 다른 칼럼, 좋아요가 많은 칼럼, 최근에 올라온 칼럼. 지금 읽는 글은 뺀다.
export function SideList({ me, current, author }: Props) {
  const account = useAccount()
  // null: 불러오는 중
  const [lists, setLists] = useState<{ own: FeedPost[]; hot: FeedPost[]; recent: FeedPost[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    const none = [] as FeedPost[]
    getFeedRemote()
      .then(async (remote) => {
        if (!remote) return { own: none, hot: none, recent: none }
        // 한 묶음을 못 읽어도 나머지는 보여 준다 (좋아요순을 아직 못 쓰는 서버 등).
        const [own, hot, recent] = await Promise.all([remote.page({ author }).catch(() => none), remote.page({ sort: 'top' }).catch(() => none), remote.page({ sort: 'new' }).catch(() => none)])
        return { own, hot, recent }
      })
      .catch(() => ({ own: none, hot: none, recent: none }))
      .then((loaded) => {
        if (!cancelled) setLists(loaded)
      })
    return () => {
      cancelled = true
    }
  }, [author])

  // 같은 글이 두 묶음에 나오지 않게, 앞 묶음에 든 글은 뒤 묶음에서 뺀다.
  const seen = new Set([current])
  const take = (posts: FeedPost[], count: number, keep: (post: FeedPost) => boolean = () => true) => {
    const picked = posts.filter((post) => !seen.has(post.id) && keep(post)).slice(0, count)
    picked.forEach((post) => seen.add(post.id))
    return picked
  }
  const own = lists ? take(lists.own, AUTHOR_COUNT) : []
  // 좋아요를 하나도 받지 않은 글은 인기 칼럼으로 치지 않는다.
  const hot = lists ? take(lists.hot, HOT_COUNT, (post) => post.likeCount > 0) : []
  const recent = lists ? take(lists.recent, RECENT_COUNT) : []

  return (
    <aside className="side" aria-label="글쓴이와 다른 칼럼">
      {account.status === 'out' && <JoinPanel />}
      <AuthorCard me={me} userId={author} />
      {lists === null ? (
        <div className="side-ghost" role="status" aria-label="다른 칼럼을 불러오는 중" />
      ) : (
        <>
          <Group title="이 글쓴이의 다른 칼럼" posts={own} />
          <Group title="인기 칼럼" posts={hot} />
          <Group title="최근 칼럼" posts={recent} />
          {own.length + hot.length + recent.length === 0 && <p className="side-empty muted">아직 다른 칼럼이 없습니다. 새 칼럼이 올라오면 여기에 보입니다.</p>}
        </>
      )}
    </aside>
  )
}
