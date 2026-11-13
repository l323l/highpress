import { useState, type FormEvent } from 'react'
import { ChatCircleIcon, HeartIcon, MinusIcon, PlusIcon, TrashIcon } from '../../components/icons'
import { avatarUrl } from '../../lib/avatar'
import { toHash } from '../../lib/router'
import { HiddenNotice } from '../moderation/HiddenNotice'
import { ModerationMenu } from '../moderation/ModerationMenu'
import { useOwn } from '../moderation/useOwn'
import { countReplies, type CommentNode, FEED_LIMITS, type FeedComment } from '@highpress/core/feed'
import { displayName, timeAgo } from './helpers'

export interface ThreadActions {
  // 로그인한 사용자의 id. 로그인하지 않았으면 빈 글자.
  me: string
  // 이 글을 쓴 사람. 그 사람의 댓글에는 "글쓴이" 표시가 붙는다.
  author: string
  busy: boolean
  // 지금 답글을 쓰고 있는 댓글
  replyTo: string | null
  onReplyTo: (commentId: string | null) => void
  onReply: (parent: FeedComment, body: string) => Promise<boolean>
  onLike: (comment: FeedComment) => void
  onRemove: (comment: FeedComment) => void
  // 댓글 쓴 사람을 차단했다. 댓글을 새로 읽는다.
  onBlocked?: (userId: string) => void
}

function ReplyForm({ parent, actions }: { parent: FeedComment; actions: ThreadActions }) {
  const [draft, setDraft] = useState('')
  const inputId = `reply-${parent.id}`

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || actions.busy) return
    void actions.onReply(parent, body).then((done) => {
      if (done) setDraft('')
    })
  }

  return (
    <form className="reply-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>
        {displayName(parent.nickname)} 님에게 답글 쓰기
      </label>
      {/* 답글 달기를 누른 사람이 바로 쓸 수 있게 커서를 둔다. */}
      <input id={inputId} className="field" placeholder="답글을 남겨 보세요" value={draft} maxLength={FEED_LIMITS.comment} autoFocus onChange={(event) => setDraft(event.target.value)} />
      <div className="reply-form__actions">
        <button type="button" className="btn btn-ghost" onClick={() => actions.onReplyTo(null)}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || actions.busy}>
          답글
        </button>
      </div>
    </form>
  )
}

// 댓글 한 개와 그 아래의 답글들. 답글은 들여 쓰고 세로 선으로 윗댓글과 잇는다. 선 위의 단추로 답글을 접고 편다.
export function CommentThread({ node, actions }: { node: CommentNode; actions: ThreadActions }) {
  const [folded, setFolded] = useState(false)
  // 프로필 사진을 받지 못했으면 이름 첫 글자로 돌아간다.
  const [noPhoto, setNoPhoto] = useState(false)
  const { comment, replies } = node
  const total = countReplies(node)
  const name = comment.deleted ? '삭제된 댓글' : displayName(comment.nickname)
  const photo = noPhoto ? null : avatarUrl(comment.avatar)
  const mine = !comment.deleted && actions.me !== '' && comment.userId === actions.me
  // 로그인한 계정의 댓글이면 (가입 마침과 상관없이) 신고 · 차단 메뉴를 붙이지 않는다.
  const own = useOwn()(comment.userId)

  return (
    <li className="thread" data-replies={replies.length > 0 || undefined} data-deleted={comment.deleted || undefined}>
      <span className="avatar thread-avatar" aria-hidden="true">
        {comment.deleted ? '' : photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setNoPhoto(true)} /> : Array.from(name)[0]}
      </span>
      <p className="thread-meta">
        {comment.deleted ? (
          <span className="muted">삭제된 댓글</span>
        ) : (
          <a className="thread-name" href={toHash({ name: 'profile', id: comment.userId })}>
            {name}
          </a>
        )}
        {!comment.deleted && comment.userId === actions.author && <span className="thread-op">글쓴이</span>}
        <time className="muted" dateTime={new Date(comment.createdAt).toISOString()}>
          {timeAgo(comment.createdAt)}
        </time>
      </p>

      {/* 답글이 있으면 아바타 아래로 선이 내려가 답글들을 잇는다. */}
      {replies.length > 0 && !folded && <span className="thread-line" aria-hidden="true" />}

      <div className="thread-main">
        {comment.deleted ? <p className="thread-body muted">글쓴이가 지운 댓글입니다.</p> : <p className="thread-body">{comment.body}</p>}
        {own && !comment.deleted && comment.hidden && <HiddenNotice what="댓글" />}

        <div className="thread-actions">
          {replies.length > 0 && (
            <button type="button" className="thread-fold" aria-expanded={!folded} aria-label={folded ? `답글 ${total}개 펴기` : `답글 ${total}개 접기`} onClick={() => setFolded(!folded)}>
              {folded ? <PlusIcon size={12} weight="bold" aria-hidden="true" /> : <MinusIcon size={12} weight="bold" aria-hidden="true" />}
            </button>
          )}
          {!comment.deleted && (
            <>
              <button type="button" className="thread-action post-like" aria-pressed={comment.liked} aria-label={`${name} 님의 댓글 좋아요 ${comment.likeCount}개`} onClick={() => actions.onLike(comment)}>
                <HeartIcon size={18} weight={comment.liked ? 'fill' : 'regular'} aria-hidden="true" />
                <span>{comment.likeCount}</span>
              </button>
              <button type="button" className="thread-action" aria-expanded={actions.replyTo === comment.id} onClick={() => actions.onReplyTo(actions.replyTo === comment.id ? null : comment.id)}>
                <ChatCircleIcon size={18} aria-hidden="true" />
                <span>답글 달기</span>
              </button>
              {mine ? (
                <button type="button" className="thread-action" disabled={actions.busy} aria-label="댓글 지우기" title="댓글 지우기" onClick={() => actions.onRemove(comment)}>
                  <TrashIcon size={18} aria-hidden="true" />
                </button>
              ) : (
                !own && (
                <ModerationMenu
                  me={actions.me}
                  variant="thread"
                  label={`${name} 님의 댓글 메뉴`}
                  person={{ userId: comment.userId, name }}
                  reports={[{ kind: 'comment', targetId: comment.id, label: '댓글', preview: comment.body.slice(0, 120) }]}
                  onBlocked={actions.onBlocked}
                />
                )
              )}
            </>
          )}
          {folded && (
            <button type="button" className="thread-more" onClick={() => setFolded(false)}>
              답글 {total}개 더 보기
            </button>
          )}
        </div>

        {actions.replyTo === comment.id && <ReplyForm parent={comment} actions={actions} />}

        {replies.length > 0 && !folded && (
          <ul className="thread-replies">
            {replies.map((reply) => (
              <CommentThread key={reply.comment.id} node={reply} actions={actions} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
