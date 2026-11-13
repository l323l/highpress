import type { CSSProperties } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { ChatCircleIcon, HeartIcon, TrashIcon } from '../../components/icons'
import { clubOf } from '../../lib/clubs'
import { navigate, toHash } from '../../lib/router'
import { HiddenNotice } from '../moderation/HiddenNotice'
import { ModerationMenu } from '../moderation/ModerationMenu'
import { useOwn } from '../moderation/useOwn'
import { displayName, timeAgo } from './helpers'
import { PostCover } from './PostCover'
import { Avatar } from './Rails'
import type { FeedPost } from '@highpress/core/feed'

interface Props {
  post: FeedPost
  // 로그인한 사용자의 id. 로그인하지 않았으면 빈 글자.
  me: string
  // 목록에서 몇 번째인지. 처음 나타날 때 차례로 보이게 한다.
  index?: number
  // 글쓴이를 누르면 프로필로 간다.
  linkAuthor?: boolean
  onLike: (post: FeedPost) => void
  onRemove: (post: FeedPost) => void
  // 글쓴이를 차단했다. 목록을 새로 읽는다.
  onBlocked?: (userId: string) => void
}

// 피드의 글 한 편. 미리보기만 보여 주고, 누르면 글 화면(전체 글과 댓글)으로 넘어간다.
export function PostCard({ post, me, index = 0, linkAuthor = true, onLike, onRemove, onBlocked }: Props) {
  const href = toHash({ name: 'post', author: post.userId, id: post.id })
  const mine = me !== '' && post.userId === me
  // 로그인한 계정의 글이면 가입을 마치지 않았어도 신고 · 차단 메뉴를 붙이지 않는다.
  const own = useOwn()(post.userId)
  const club = clubOf(post.club)

  const author = (
    <>
      <Avatar name={post.nickname} src={post.avatar} />
      <span className="post-author">
        <strong>{displayName(post.nickname)}</strong>
        <time className="muted" dateTime={new Date(post.createdAt).toISOString()}>
          {timeAgo(post.createdAt)}
        </time>
      </span>
    </>
  )

  return (
    <article
      className="post post--link"
      // 카드의 빈 자리를 눌러도 글 화면으로 간다. 링크와 단추는 제 할 일을 하고, 글자를 끌어 고르는 중에는 넘어가지 않는다.
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        if (window.getSelection()?.toString()) return
        navigate({ name: 'post', author: post.userId, id: post.id })
      }}
      style={{ '--i': Math.min(index, 6) } as CSSProperties}
      // 커서가 있는 자리부터 은은하게 밝아지도록 위치만 알려 준다 (화면을 다시 그리지 않는다).
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
        event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
      }}
    >
      <header className="post-head">
        {linkAuthor ? (
          <a className="post-by" href={toHash({ name: 'profile', id: post.userId })} aria-label={`${displayName(post.nickname)} 님의 프로필`}>
            {author}
          </a>
        ) : (
          <span className="post-by">{author}</span>
        )}
        {club && (
          <span className="post-club">
            <ClubBadge club={club} size={20} />
            {club.short}
          </span>
        )}
        {mine ? (
          <button type="button" className="icon-btn" aria-label="피드에서 내리기" title="피드에서 내리기" onClick={() => onRemove(post)}>
            <TrashIcon size={18} aria-hidden="true" />
          </button>
        ) : (
          !own && (
          <ModerationMenu
            me={me}
            label={`${displayName(post.nickname)} 님의 글 메뉴`}
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

      {own && post.hidden && <HiddenNotice what="글" />}

      {/* 제목 · 사진 · 앞부분: 어디를 눌러도 글 화면으로 간다. */}
      <a className="post-open" href={href}>
        <h3 className="post-title">{post.title}</h3>
        {post.cover && <PostCover path={post.cover} title={post.title} />}
        {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
      </a>

      <footer className="post-actions">
        <button type="button" className="post-action post-like" aria-pressed={post.liked} aria-label={`좋아요 ${post.likeCount}개`} onClick={() => onLike(post)}>
          <HeartIcon size={20} weight={post.liked ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{post.likeCount}</span>
        </button>
        <a className="post-action" href={href} aria-label={`댓글 ${post.commentCount}개 보기`}>
          <ChatCircleIcon size={20} aria-hidden="true" />
          <span>{post.commentCount}</span>
        </a>
      </footer>
    </article>
  )
}
