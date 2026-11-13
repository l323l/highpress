import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { ArrowLeftIcon, ChatCircleIcon, HeartIcon, LinkIcon } from '../../components/icons'
import { clubOf } from '../../lib/clubs'
import { goBack, navigate, toHash } from '../../lib/router'
import { canSync, useAccount } from '../account'
import { HiddenNotice } from '../moderation/HiddenNotice'
import { ModerationMenu } from '../moderation/ModerationMenu'
import { useOwn } from '../moderation/useOwn'
import { Avatar, Comments, displayName, FeedError, getFeedRemote, LoginNote, PostCover, prepareEdit, timeAgo, type FeedPost } from '../feed'
import '../feed/feed.css'
import './post.css'
import { ReadTop } from './ReadTop'
import { OwnerMenu } from './OwnerMenu'
import { SideList } from './SideList'

const PostBody = lazy(() => import('../feed/PostBody'))

function Skeleton() {
  return (
    <div className="post post-skeleton" role="status" aria-label="글을 불러오는 중">
      <span />
      <span />
      <span />
    </div>
  )
}

// blocked: 글쓴이를 차단했다. 이 글은 더 보이지 않는다.
function Article({ me, author, postId, blocked, onBlocked }: { me: string; author: string; postId: string; blocked: boolean; onBlocked: () => void }) {
  // undefined: 불러오는 중, null: 없는 글
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined)
  const isOwn = useOwn()
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState('')
  // 로그인하지 않은 사람이 로그인해야 하는 일을 눌렀을 때 띄우는 안내
  const [ask, setAsk] = useState('')
  const [copied, setCopied] = useState(false)
  // 글 고치기를 준비하는 중
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.post(author, postId) : Promise.reject(new FeedError('failed'))))
      .then((loaded) => {
        if (!cancelled) setPost(loaded)
      })
      .catch((cause) => {
        if (cancelled) return
        setPost(null)
        setDenied(cause instanceof FeedError && cause.code === 'denied')
      })
    return () => {
      cancelled = true
    }
  }, [author, postId])

  // 글 아래의 단추 줄(좋아요 · 댓글 · 공유)이 화면에 보이지 않는 동안에는 같은 단추를 화면 아래에 띄운다.
  // 긴 글을 읽는 중에도, 댓글을 읽는 중에도 바로 누를 수 있다.
  const actionsRow = useRef<HTMLElement>(null)
  const [floating, setFloating] = useState(false)
  const loadedId = post?.id
  useEffect(() => {
    const node = actionsRow.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting))
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadedId])

  if (post === undefined) return <Skeleton />

  if (blocked && post) {
    return (
      <div className="feed-empty" role="status">
        <h2>{displayName(post.nickname)}님을 차단했습니다</h2>
        <p className="muted">이 사람의 글과 댓글은 더 보이지 않습니다. 설정의 “차단한 사람”에서 풀 수 있습니다.</p>
        <a className="btn" href="#/">
          피드로 돌아가기
        </a>
      </div>
    )
  }

  if (post === null) {
    return (
      <div className="feed-empty">
        <h2>글을 찾을 수 없습니다</h2>
        <p className="muted">{denied ? '지금은 로그인해야 글을 볼 수 있습니다.' : '글쓴이가 피드에서 내렸거나 주소가 맞지 않습니다.'}</p>
        <a className="btn" href="#/">
          피드로 돌아가기
        </a>
      </div>
    )
  }

  const mine = me !== '' && post.userId === me
  // 로그인한 계정의 글이면 (가입 마침과 상관없이) 신고 · 차단 메뉴를 붙이지 않는다.
  const own = isOwn(post.userId)
  const club = clubOf(post.club)

  // 안내와 오류는 글 아래의 단추 줄 옆에 뜬다. 떠 있는 단추에서 눌렀으면 그 자리가 보이게 옮겨 준다.
  const reveal = () => window.requestAnimationFrame(() => actionsRow.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))

  const like = async () => {
    if (!me) {
      setAsk('좋아요는')
      reveal()
      return
    }
    const liked = !post.liked
    // 먼저 화면을 바꾸고, 서버가 거절하면 되돌린다.
    setPost({ ...post, liked, likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)) })
    setError('')
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await (liked ? remote.like(post.id) : remote.unlike(post.id))
    } catch {
      setPost(post)
      setError('좋아요를 반영하지 못했습니다. 잠시 뒤 다시 눌러 주세요.')
      reveal()
    }
  }

  const remove = async () => {
    if (!window.confirm(`"${post.title}" 글을 피드에서 내릴까요? 좋아요와 댓글도 함께 지워집니다. 이 기기의 칼럼은 그대로 남습니다.`)) return
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await remote.unpublish(post.id)
      navigate({ name: 'home' })
    } catch {
      setError('글을 내리지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    }
  }

  // 글쓰기 화면에서 이 글을 고친다. 원본이 이 기기에 없으면 피드의 글을 받아 칼럼으로 만들어 연다.
  const edit = async () => {
    setWorking(true)
    setError('')
    try {
      navigate({ name: 'write', id: await prepareEdit(post) })
    } catch {
      setError('글을 고칠 준비를 하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      setWorking(false)
    }
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    } catch {
      setError('주소를 복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.')
      reveal()
    }
  }

  // 주소(#/p/…)를 바꾸지 않고 댓글 자리로만 내려간다.
  // 가입자는 내려가자마자 쓸 수 있게 댓글 칸에 커서를 둔다.
  const toComments = () => {
    document.getElementById('read-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (me) document.getElementById(`comment-${post.id}`)?.focus({ preventScroll: true })
  }

  return (
    <>
      <article className="read" aria-labelledby="read-title">
        <header className="read-head">
          <button type="button" className="read-back" aria-label="뒤로" title="뒤로" onClick={goBack}>
            <ArrowLeftIcon size={20} aria-hidden="true" />
          </button>
          <a className="post-by" href={toHash({ name: 'profile', id: post.userId })} aria-label={`${displayName(post.nickname)} 님의 프로필`}>
            <Avatar name={post.nickname} src={post.avatar} />
            <span className="post-author">
              <strong>{displayName(post.nickname)}</strong>
              <time className="muted" dateTime={new Date(post.createdAt).toISOString()}>
                {timeAgo(post.createdAt)}
              </time>
            </span>
          </a>
          {mine ? (
            <OwnerMenu busy={working} onEdit={() => void edit()} onRemove={() => void remove()} />
          ) : (
            !own && (
            <ModerationMenu
              me={me}
              label="이 글 메뉴"
              person={{ userId: post.userId, name: displayName(post.nickname) }}
              reports={[
                { kind: 'post', targetId: post.id, label: '글', preview: post.title },
                ...(post.cover ? [{ kind: 'post' as const, targetId: post.id, part: 'cover' as const, label: '대표 사진', preview: post.title }] : []),
              ]}
              onBlocked={onBlocked}
            />
            )
          )}
        </header>

        <h1 id="read-title" className="read-title">
          {post.title}
        </h1>
        {own && post.hidden && <HiddenNotice what="글" />}
        {/* 구단 꼬리표: 누르면 그 구단의 글을 모아 본다. */}
        {club && (
          <p className="read-tags">
            <a className="post-club" href={toHash({ name: 'home', q: club.name })} title={`${club.name} 칼럼 찾기`}>
              <ClubBadge club={club} size={20} />
              {club.name}
            </a>
          </p>
        )}
        {post.cover && <PostCover path={post.cover} title={post.title} />}

        <Suspense
          fallback={
            <p className="muted post-status" role="status">
              글을 불러오는 중…
            </p>
          }
        >
          <PostBody postId={post.id} />
        </Suspense>

        <footer ref={actionsRow} className="read-actions">
          <button type="button" className="read-action post-like" aria-pressed={post.liked} aria-label={`좋아요 ${post.likeCount}개`} onClick={() => void like()}>
            <HeartIcon size={20} weight={post.liked ? 'fill' : 'regular'} aria-hidden="true" />
            <span>{post.likeCount}</span>
          </button>
          <button type="button" className="read-action" aria-label={`댓글 ${post.commentCount}개로 내려가기`} onClick={toComments}>
            <ChatCircleIcon size={20} aria-hidden="true" />
            <span>{post.commentCount}</span>
          </button>
          <button type="button" className="read-action" onClick={() => void share()}>
            <LinkIcon size={20} aria-hidden="true" />
            <span>{copied ? '복사했습니다' : '공유'}</span>
          </button>
          {/* 단추의 이름은 그대로 두고, 복사한 사실만 따로 알린다. */}
          <span className="sr-only" role="status">
            {copied ? '이 글의 주소를 복사했습니다.' : ''}
          </span>
        </footer>
        {error && (
          <p className="feed-error" role="alert">
            {error}
          </p>
        )}
        {ask && <LoginNote what={ask} onClose={() => setAsk('')} />}
      </article>

      <section id="read-comments" className="read-comments" aria-labelledby="read-comments-title">
        <h2 id="read-comments-title" className="read-comments__title">
          댓글 {post.commentCount}개
        </h2>
        <Comments post={post} me={me} onCount={(delta) => setPost((current) => (current ? { ...current, commentCount: Math.max(0, current.commentCount + delta) } : current))} />
      </section>

      {/* 화면 아래에 따라다니는 단추 줄. 글 아래의 단추 줄이 보이는 동안에는 숨는다 (같은 단추가 두 번 보이지 않게). */}
      <div className="read-float" data-shown={floating || undefined} inert={!floating} aria-hidden={!floating}>
        <div className="read-float__bar" role="group" aria-label="이 글에 반응하기">
          <button type="button" className="read-action post-like" aria-pressed={post.liked} aria-label={`좋아요 ${post.likeCount}개`} onClick={() => void like()}>
            <HeartIcon size={20} weight={post.liked ? 'fill' : 'regular'} aria-hidden="true" />
            <span>{post.likeCount}</span>
          </button>
          <button type="button" className="read-action" aria-label={`댓글 ${post.commentCount}개. 댓글 쓰러 가기`} onClick={toComments}>
            <ChatCircleIcon size={20} aria-hidden="true" />
            <span>{post.commentCount}</span>
          </button>
          <button type="button" className="read-action" onClick={() => void share()}>
            <LinkIcon size={20} aria-hidden="true" />
            <span>{copied ? '복사했습니다' : '공유'}</span>
          </button>
        </div>
      </div>
    </>
  )
}

// 글 한 편을 읽는 화면: 왼쪽에 글과 댓글, 오른쪽에 다른 칼럼 추천. 읽기는 누구나 하고, 좋아요와 댓글은 가입자만 한다.
export function PostPage({ author, postId }: { author: string; postId: string }) {
  const account = useAccount()
  const me = account.status === 'in' && canSync(account) ? account.userId : ''
  // 이 글의 글쓴이를 차단했다. 글과 오른쪽의 글쓴이 · 다른 글을 함께 거둔다.
  const [blocked, setBlocked] = useState<string | null>(null)

  // 다른 글로 넘어오면 맨 위에서 읽기 시작한다.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [postId])

  return (
    <main className="read-page">
      <ReadTop />

      {account.status === 'off' ? (
        <div className="feed-empty">
          <h2>글을 볼 수 없습니다</h2>
          <p className="muted">서버 설정이 없어 피드의 글을 읽을 수 없습니다.</p>
        </div>
      ) : account.status === 'loading' ? (
        <Skeleton />
      ) : (
        <div className="read-layout">
          {/* 로그인하거나 로그아웃하면 처음부터 다시 읽는다 (내가 누른 좋아요 표시가 달라진다). */}
          <div className="read-main">
            <Article key={`${me}:${postId}`} me={me} author={author} postId={postId} blocked={blocked === author} onBlocked={() => setBlocked(author)} />
          </div>
          {blocked !== author && <SideList key={`${me}:${author}`} me={me} current={postId} author={author} />}
        </div>
      )}
    </main>
  )
}
