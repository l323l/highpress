import { useEffect, useState, type FormEvent } from 'react'
import { buildThreads, FEED_LIMITS, FeedError, feedSafetyText, type FeedComment, type FeedPost, type FeedRemote } from '@highpress/core/feed'
import { CommentThread } from './CommentThread'
import { LoginNote } from './LoginNote'
import { getFeedRemote } from './remote'

function commentErrorText(error: unknown): string {
  const safety = feedSafetyText(error)
  if (safety) return safety
  if (error instanceof FeedError && error.code === 'quota') return `댓글은 ${FEED_LIMITS.comment}자까지, 하루 ${FEED_LIMITS.commentsPerDay}개까지 쓸 수 있습니다.`
  if (error instanceof FeedError && error.code === 'full') return '서버가 한도에 닿아 지금은 새 댓글을 받지 않습니다.'
  if (error instanceof FeedError && error.code === 'outdated') return '답글과 댓글 좋아요는 서버 설정(0010_comment_threads.sql)을 마친 뒤 쓸 수 있습니다.'
  return '댓글을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}

// 글 아래의 댓글: 쓰는 칸, 정렬, 답글로 엮인 댓글들.
// me 가 빈 글자면 로그인하지 않은 사람이다. 읽을 수만 있고, 쓰기 · 좋아요 · 답글을 누르면 로그인 안내가 뜬다.
export function Comments({ post, me, onCount }: { post: FeedPost; me: string; onCount: (delta: number) => void }) {
  // null: 불러오는 중
  const [list, setList] = useState<FeedComment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // old: 먼저 쓴 댓글부터, new: 최근 댓글부터
  const [order, setOrder] = useState<'old' | 'new'>('old')
  // 지금 답글을 쓰고 있는 댓글
  const [replyTo, setReplyTo] = useState<string | null>(null)
  // 로그인하지 않은 사람이 로그인해야 하는 일을 눌렀을 때 띄우는 안내 (무엇을 하려 했는지)
  const [ask, setAsk] = useState('')
  const inputId = `comment-${post.id}`

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.comments(post.id) : Promise.reject(new FeedError('failed'))))
      .then((loaded) => {
        if (!cancelled) setList(loaded)
      })
      .catch(() => {
        if (cancelled) return
        setList([])
        setError('댓글을 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [post.id])

  // 서버에 일을 시키고 목록을 다시 읽는다. 일이 돌려준 수만큼 글의 댓글 수를 바꾼다. 됐으면 true.
  const run = async (work: (remote: FeedRemote) => Promise<number>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      const delta = await work(remote)
      if (delta !== 0) onCount(delta)
      setList(await remote.comments(post.id))
      return true
    } catch (cause) {
      setError(commentErrorText(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    void run(async (remote) => {
      await remote.addComment(post.id, body)
      return 1
    }).then((done) => {
      if (done) setDraft('')
    })
  }

  const reply = async (parent: FeedComment, body: string) => {
    const done = await run(async (remote) => {
      await remote.addComment(post.id, body, parent.id)
      return 1
    })
    if (done) setReplyTo(null)
    return done
  }

  const remove = (comment: FeedComment) => {
    if (!window.confirm('이 댓글을 지울까요? 답글이 달려 있으면 내용만 지워지고 자리는 남습니다.')) return
    // 자리만 남은 댓글은 여전히 댓글 수에 든다.
    void run(async (remote) => ((await remote.removeComment(comment.id)) ? -1 : 0))
  }

  const like = async (comment: FeedComment) => {
    if (!me) {
      setAsk('댓글 좋아요는')
      return
    }
    const liked = !comment.liked
    const patch = (change: (current: FeedComment) => FeedComment) => setList((previous) => previous?.map((item) => (item.id === comment.id ? change(item) : item)) ?? previous)
    // 먼저 화면을 바꾸고, 서버가 거절하면 되돌린다.
    patch((current) => ({ ...current, liked, likeCount: Math.max(0, current.likeCount + (liked ? 1 : -1)) }))
    setError('')
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await (liked ? remote.likeComment(comment.id) : remote.unlikeComment(comment.id))
    } catch (cause) {
      patch((current) => ({ ...current, liked: comment.liked, likeCount: comment.likeCount }))
      setError(cause instanceof FeedError && cause.code === 'outdated' ? commentErrorText(cause) : '좋아요를 반영하지 못했습니다. 잠시 뒤 다시 눌러 주세요.')
    }
  }

  const startReply = (commentId: string | null) => {
    if (commentId && !me) {
      setAsk('답글 쓰기는')
      return
    }
    setReplyTo(commentId)
  }

  // 댓글 쓴 사람을 차단하면 그 사람의 댓글이 서버에서 빠진다. 목록을 새로 읽는다 (댓글 수는 다음에 글을 열 때 맞춰진다).
  const reloadAfterBlock = () => void run(async () => 0)

  const threads = list ? buildThreads(list, order) : []
  const orderButton = (value: 'old' | 'new', label: string) => (
    <button type="button" aria-pressed={order === value} onClick={() => setOrder(value)}>
      {label}
    </button>
  )

  return (
    <section className="comments" aria-label="댓글">
      {/* 로그인 안내는 한 번에 하나만 보인다. 좋아요나 답글을 눌렀으면 그 안내가 대신 선다. */}
      {!me && !ask && <LoginNote what="댓글 쓰기는" />}
      <form className="comment-form" onSubmit={submit} hidden={!me}>
        <label className="sr-only" htmlFor={inputId}>
          댓글 쓰기
        </label>
        <input id={inputId} className="field" placeholder="댓글을 남겨 보세요" value={draft} maxLength={FEED_LIMITS.comment} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy}>
          등록
        </button>
      </form>
      {error && (
        <p className="feed-error" role="alert">
          {error}
        </p>
      )}
      {ask && <LoginNote what={ask} onClose={() => setAsk('')} />}

      {list === null && (
        <p className="muted" role="status">
          댓글을 불러오는 중…
        </p>
      )}
      {list !== null && list.length === 0 && !error && <p className="muted">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</p>}
      {threads.length > 1 && (
        <div className="comment-sort">
          <span className="muted" id={`${inputId}-sort`}>
            정렬
          </span>
          <div className="seg" role="group" aria-labelledby={`${inputId}-sort`}>
            {orderButton('old', '등록순')}
            {orderButton('new', '최신순')}
          </div>
        </div>
      )}
      {threads.length > 0 && (
        <ul className="comment-list">
          {threads.map((node) => (
            <CommentThread key={node.comment.id} node={node} actions={{ me, author: post.userId, busy, replyTo, onReplyTo: startReply, onReply: reply, onLike: (comment) => void like(comment), onRemove: remove, onBlocked: reloadAfterBlock }} />
          ))}
        </ul>
      )}
    </section>
  )
}
