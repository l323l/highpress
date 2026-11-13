import type { SupabaseClient } from '@supabase/supabase-js'
import type { JSONContent } from '../body/json'

// 피드에 올라온 칼럼 한 편. 본문은 펼칠 때 따로 읽는다.
export interface FeedPost {
  id: string
  userId: string
  nickname: string
  columnId: string
  title: string
  excerpt: string
  // 올린 시각 (ms)
  createdAt: number
  likeCount: number
  commentCount: number
  liked: boolean
  // 구단 태그 (src/lib/clubs.ts 의 id). 없으면 null.
  club: string | null
  // 대표 사진이 보관함의 어디에 있는지. 없으면 null.
  cover: string | null
  // 글쓴이의 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar: string | null
  // 신고로 숨겨졌다. 글쓴이 자신에게만 true 로 온다 (0014_moderation.sql).
  hidden?: boolean
}

// 인기 칼럼리스트 한 명. 최근 30일 동안 받은 좋아요 순으로 온다.
export interface FeedPerson {
  userId: string
  nickname: string
  club: string | null
  // 마지막 접속 시각 (ms). 한 번도 기록되지 않았으면 null.
  lastSeenAt: number | null
  likeCount: number
  // 최근 7일 안에 새 글을 올렸다.
  fresh: boolean
  // 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar: string | null
}

export interface FeedProfile {
  userId: string
  nickname: string
  bio: string
  club: string | null
  lastSeenAt: number | null
  postCount: number
  followerCount: number
  followingCount: number
  likeCount: number
  // 내가 이 사람을 팔로우하고 있다.
  following: boolean
  fresh: boolean
  // 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar: string | null
}

// new: 최근에 올린 순, top: 좋아요가 많은 순
export type FeedSort = 'new' | 'top'

export interface PageOptions {
  before?: number
  // 좋아요순에서 다음 쪽을 읽을 때 건너뛸 글 수 (좋아요 수는 계속 바뀌어 시각으로 이어 읽을 수 없다)
  offset?: number
  sort?: FeedSort
  author?: string | null
  club?: string | null
  // 이 구단들 가운데 하나인 글만 (리그로 거를 때 그 리그의 구단들)
  clubs?: string[] | null
  // 내가 팔로우한 사람의 글만
  following?: boolean
  // 제목·앞부분·글쓴이에 이 말이 들어 있는 글만
  query?: string
}

// 검색으로 찾은 칼럼리스트 한 명.
export interface FoundPerson {
  userId: string
  nickname: string
  club: string | null
  lastSeenAt: number | null
  postCount: number
  fresh: boolean
  // 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar: string | null
}

export interface FeedComment {
  id: string
  userId: string
  nickname: string
  body: string
  createdAt: number
  // 어느 댓글의 답글인지. 글에 바로 단 댓글이면 null.
  parentId: string | null
  likeCount: number
  // 내가 이 댓글에 좋아요를 눌렀다.
  liked: boolean
  // 지워진 자리. 답글이 달려 있어 자리만 남았고, 글쓴이와 내용은 비어 있다.
  deleted: boolean
  // 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar: string | null
  // 신고로 숨겨졌다. 글쓴이 자신에게만 true 로 온다 (0014_moderation.sql).
  hidden?: boolean
}

export interface PublishInput {
  columnId: string
  title: string
  excerpt: string
  body: JSONContent
  club: string | null
  // 올릴 크기로 줄인 대표 사진. 없으면 사진 없이 올린다 (전에 올린 사진은 지워진다).
  cover: Blob | null
}

// 대표 사진을 두는 보관함 (0008_cover.sql)
const COVER_BUCKET = 'post-covers'
// 프로필 사진을 두는 공개 보관함 (0011_avatar.sql)
const AVATAR_BUCKET = 'avatars'

// 서버 한도와 같은 값 (0003_feed.sql, 0004_social.sql)
export const FEED_LIMITS = { posts: 20, bodyBytes: 307_200, excerpt: 300, comment: 500, commentsPerDay: 100, page: 20, bio: 80, follows: 200, popular: 10, query: 50 } as const

// quota: 본인 한도(글 20편, 하루 댓글 100개, 본문 크기, 팔로우 200명), full: 서버가 한도에 닿아 새 글·댓글을 받지 않음
// outdated: 서버에 0004_social.sql 이 아직 없어 이 기능을 쓸 수 없음
// cover: 글은 올라갔지만 대표 사진은 올리지 못함
// denied: 읽을 권한이 없음 (서버에 0009_public_read.sql 이 아직 없는데 로그인하지 않았다)
// banned: 금칙어가 들어 있음, suspended: 이용이 정지된 계정, blocked: 상대가 나를 차단함 (0014_moderation.sql)
export type FeedErrorCode = 'quota' | 'full' | 'outdated' | 'cover' | 'denied' | 'banned' | 'suspended' | 'blocked' | 'failed'

// 커뮤니티 안전 규칙(0014_moderation.sql)에 걸렸을 때의 문구. 글 · 댓글 · 팔로우 · 프로필이 함께 쓴다.
export const FEED_SAFETY_TEXT = {
  banned: '쓸 수 없는 말이 들어 있습니다. 그 말을 고친 뒤 다시 시도해 주세요.',
  suspended: '이용이 정지된 계정이라 글 · 댓글 · 팔로우 · 프로필 수정을 할 수 없습니다. 이용약관의 문의 연락처로 알려 주세요.',
  blocked: '상대가 나를 차단해 이 사람의 글에 댓글을 달거나 팔로우할 수 없습니다.',
} as const satisfies Partial<Record<FeedErrorCode, string>>

// 안전 규칙에 걸린 오류면 그 문구, 아니면 null. 각 화면은 null 일 때 자기 문구를 쓴다.
export function feedSafetyText(error: unknown): string | null {
  if (!(error instanceof FeedError)) return null
  if (error.code === 'banned' || error.code === 'suspended' || error.code === 'blocked') return FEED_SAFETY_TEXT[error.code]
  return null
}

export class FeedError extends Error {
  readonly code: FeedErrorCode

  constructor(code: FeedErrorCode) {
    super(code)
    this.code = code
  }
}

export interface FeedRemote {
  page(options: PageOptions): Promise<FeedPost[]>
  // 글 한 편. 내려갔거나 없는 글이면 null.
  post(authorId: string, postId: string): Promise<FeedPost | null>
  popular(): Promise<FeedPerson[]>
  searchPeople(query: string): Promise<FoundPerson[]>
  profile(userId: string): Promise<FeedProfile | null>
  saveProfile(userId: string, patch: { bio: string; club: string | null }): Promise<void>
  // 프로필 사진을 바꾼다 (photo 가 null 이면 사진을 뗀다). 새 사진의 위치를 돌려준다.
  saveAvatar(userId: string, photo: Blob | null, previous: string | null): Promise<string | null>
  follow(userId: string): Promise<void>
  unfollow(userId: string): Promise<void>
  body(postId: string): Promise<JSONContent | null>
  // 대표 사진 파일. 받지 못하면 null.
  cover(path: string): Promise<Blob | null>
  publish(input: PublishInput): Promise<void>
  unpublish(postId: string): Promise<void>
  like(postId: string): Promise<void>
  unlike(postId: string): Promise<void>
  comments(postId: string): Promise<FeedComment[]>
  // parentId 를 주면 그 댓글의 답글로 단다.
  addComment(postId: string, body: string, parentId?: string | null): Promise<void>
  // 완전히 지워졌으면 true, 답글이 달려 있어 자리만 남았으면 false.
  removeComment(commentId: string): Promise<boolean>
  likeComment(commentId: string): Promise<void>
  unlikeComment(commentId: string): Promise<void>
  touch(): Promise<void>
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const count = (value: unknown): number => Math.max(0, Number(value) || 0)
const time = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) || 0 : 0)

const stamp = (value: unknown): number | null => (value ? time(value) : null)
const tag = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

// PGRST202·PGRST205: 함수·테이블이 없다, 42703·PGRST204: 칸이 없다. 서버에 0004_social.sql 을 아직 넣지 않은 상태다.
const isOutdated = (error: { code?: string }) => ['PGRST202', 'PGRST204', 'PGRST205', '42703', '42P01', '42883'].includes(error.code ?? '')

function fail(error: { message: string; code?: string }): FeedError {
  if (/server_full/.test(error.message)) return new FeedError('full')
  // 안전 규칙 오류는 서버가 어떤 SQLSTATE 로 올리든 메시지로 가린다. 23514 · 42501 보다 먼저 본다.
  if (/\bbanned_word\b/.test(error.message)) return new FeedError('banned')
  if (/\bsuspended\b/.test(error.message)) return new FeedError('suspended')
  if (/\bblocked\b/.test(error.message)) return new FeedError('blocked')
  // 23514: 본문 크기·글자 수 같은 check 제약 위반. body_too_complex: 본문 조각이 너무 많다 (0014).
  if (/post_quota|comment_quota|follow_quota|body_too_complex/.test(error.message) || error.code === '23514') return new FeedError('quota')
  if (isOutdated(error)) return new FeedError('outdated')
  // 42501: 권한 없음
  if (error.code === '42501' || /permission denied/i.test(error.message)) return new FeedError('denied')
  return new FeedError('failed')
}

function toPost(row: Record<string, unknown>): FeedPost {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    nickname: text(row.nickname),
    columnId: text(row.column_id),
    title: text(row.title),
    excerpt: text(row.excerpt),
    createdAt: time(row.created_at),
    likeCount: count(row.like_count),
    commentCount: count(row.comment_count),
    liked: row.liked === true,
    club: tag(row.club),
    cover: tag(row.cover),
    avatar: tag(row.avatar),
    hidden: row.hidden === true,
  }
}

// 댓글에 함께 실려 오는 글쓴이 프로필. 관계 모양에 따라 객체나 배열로 온다.
function embeddedNickname(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value
  return text((row as { nickname?: unknown } | null | undefined)?.nickname)
}

// 서버 클라이언트는 밖에서 받는다 (웹은 src/lib/supabase.ts, 앱은 mobile/src/lib/supabase.ts).
export function createFeedRemote(server: SupabaseClient): FeedRemote {
  return {
    async page({ before, offset, sort, author, club, clubs, following, query }) {
      const search = (query ?? '').trim().slice(0, FEED_LIMITS.query)
      const league = clubs && clubs.length > 0 ? clubs : null
      const top = sort === 'top'
      const base = { p_before: before ? new Date(before).toISOString() : null, p_author: author ?? null, p_limit: FEED_LIMITS.page }
      const filtered = { ...base, p_club: club ?? null, p_following: following === true }
      const searched = { ...filtered, p_query: search || null, p_clubs: league }
      let { data, error } = await server.rpc('feed_page', { ...searched, p_sort: top ? 'top' : 'new', p_offset: top ? Math.max(0, offset ?? 0) : 0 })
      // 서버가 아직 예전 함수뿐이면, 그 함수가 받는 조건까지만 써서 계속 보여 준다 (0007 → 0005 → 0004 → 0003 순서로 내려간다).
      // 좋아요순은 예전 함수가 할 수 없으므로 내려가지 않고 알린다.
      if (error && isOutdated(error) && !top) ({ data, error } = await server.rpc('feed_page', searched))
      if (error && isOutdated(error) && !top && !search && !league) ({ data, error } = await server.rpc('feed_page', filtered))
      if (error && isOutdated(error) && !top && !search && !league && !club && !following) ({ data, error } = await server.rpc('feed_page', base))
      if (error) throw fail(error)
      return ((data ?? []) as Record<string, unknown>[]).map(toPost)
    },
    async post(authorId, postId) {
      // 한 사람이 올릴 수 있는 글은 한 쪽(20편)을 넘지 않으므로, 그 사람의 글 목록에서 찾는다. 서버에 함수를 더 두지 않아도 된다.
      const list = await this.page({ author: authorId })
      return list.find((item) => item.id === postId) ?? null
    },
    async searchPeople(query) {
      const search = query.trim().slice(0, FEED_LIMITS.query)
      if (!search) return []
      const { data, error } = await server.rpc('search_columnists', { p_query: search, p_limit: 8 })
      if (error) throw fail(error)
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        userId: text(row.user_id),
        nickname: text(row.nickname),
        club: tag(row.club),
        lastSeenAt: stamp(row.last_seen_at),
        postCount: count(row.post_count),
        fresh: row.fresh === true,
        avatar: tag(row.avatar),
      }))
    },
    async popular() {
      const { data, error } = await server.rpc('popular_columnists', { p_limit: FEED_LIMITS.popular })
      if (error) throw fail(error)
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        userId: text(row.user_id),
        nickname: text(row.nickname),
        club: tag(row.club),
        lastSeenAt: stamp(row.last_seen_at),
        likeCount: count(row.like_count),
        fresh: row.fresh === true,
        avatar: tag(row.avatar),
      }))
    },
    async profile(userId) {
      const { data, error } = await server.rpc('profile_summary', { p_user: userId })
      if (error) throw fail(error)
      const row = ((data ?? []) as Record<string, unknown>[])[0]
      if (!row) return null
      return {
        userId: text(row.user_id),
        nickname: text(row.nickname),
        bio: text(row.bio),
        club: tag(row.club),
        lastSeenAt: stamp(row.last_seen_at),
        postCount: count(row.post_count),
        followerCount: count(row.follower_count),
        followingCount: count(row.following_count),
        likeCount: count(row.like_count),
        following: row.following === true,
        fresh: row.fresh === true,
        avatar: tag(row.avatar),
      }
    },
    async saveProfile(userId, patch) {
      // 본인 것만 고쳐진다 (RLS).
      const { error } = await server.from('profiles').update({ bio: patch.bio, club: patch.club }).eq('user_id', userId)
      if (error) throw fail(error)
    },
    async saveAvatar(userId, photo, previous) {
      // 새 사진을 먼저 올리고 프로필이 그것을 가리키게 한 뒤, 예전 사진을 치운다. 중간에 실패해도 프로필이 없는 사진을 가리키지 않는다.
      let next: string | null = null
      if (photo) {
        next = `${userId}/${Date.now()}.${photo.type === 'image/jpeg' ? 'jpg' : 'webp'}`
        const { error: uploadError } = await server.storage.from(AVATAR_BUCKET).upload(next, photo, { contentType: photo.type || 'image/webp', cacheControl: '31536000' })
        // 보관함이 아직 없으면 서버 설정(0011_avatar.sql)을 넣기 전이다.
        if (uploadError) throw new FeedError(/bucket not found/i.test(uploadError.message) ? 'outdated' : 'failed')
      }
      const { error } = await server.from('profiles').update({ avatar: next }).eq('user_id', userId)
      if (error) {
        if (next) await server.storage.from(AVATAR_BUCKET).remove([next])
        throw fail(error)
      }
      // 예전 사진을 못 치워도 프로필은 이미 바뀌었다 (한 사람이 둘 수 있는 장수에 한도가 있어 쌓이지 않는다).
      if (previous && previous !== next) await server.storage.from(AVATAR_BUCKET).remove([previous])
      return next
    },
    async follow(userId) {
      const { error } = await server.from('follows').insert({ followee_id: userId })
      // 23505: 이미 팔로우했다. 결과가 같으므로 실패로 보지 않는다.
      if (error && error.code !== '23505') throw fail(error)
    },
    async unfollow(userId) {
      // 본인 것만 지워진다 (RLS).
      const { error } = await server.from('follows').delete().eq('followee_id', userId)
      if (error) throw fail(error)
    },
    async body(postId) {
      // 로그인하지 않은 사람도 읽을 수 있게 함수로 읽는다 (0009_public_read.sql).
      const read = await server.rpc('post_body', { p_post: postId })
      if (!read.error) return (read.data as JSONContent | null) ?? null
      if (!isOutdated(read.error)) throw fail(read.error)
      // 서버에 그 함수가 아직 없으면 예전처럼 표에서 읽는다 (가입자만 된다).
      const { data, error } = await server.from('posts').select('body').eq('id', postId).maybeSingle()
      if (error) throw fail(error)
      return data ? (data.body as JSONContent) : null
    },
    async cover(path) {
      const { data, error } = await server.storage.from(COVER_BUCKET).download(path)
      return error ? null : data
    },
    async publish(input) {
      // user_id는 서버가 로그인한 사용자로 채운다. 같은 칼럼을 다시 올리면 내용만 바뀐다.
      const row = { column_id: input.columnId, title: input.title, excerpt: input.excerpt, body: input.body }
      const { data: auth } = await server.auth.getSession()
      const me = auth.session?.user.id
      // 대표 사진의 위치는 "<내 id>/<칼럼 id>" 하나로 정해져 있다.
      const place = me ? `${me}/${input.columnId}` : null
      if (input.cover && !place) throw new FeedError('failed')
      const cover = input.cover ? place : null
      let { error } = await server.from('posts').upsert({ ...row, club: input.club, cover }, { onConflict: 'user_id,column_id' })
      // 서버에 대표 사진 칸이 아직 없고 사진을 고르지 않았으면 그 칸 없이 올린다.
      if (error && isOutdated(error) && !cover) ({ error } = await server.from('posts').upsert({ ...row, club: input.club }, { onConflict: 'user_id,column_id' }))
      // 서버에 구단 칸이 아직 없고 구단을 고르지 않았으면 예전 방식으로 올린다.
      if (error && isOutdated(error) && !cover && !input.club) ({ error } = await server.from('posts').upsert(row, { onConflict: 'user_id,column_id' }))
      if (error) throw fail(error)
      if (!place) return
      if (!input.cover) {
        // 사진 없이 다시 올렸으면 전에 올린 사진을 지운다. 없으면 아무 일도 일어나지 않는다.
        await server.storage.from(COVER_BUCKET).remove([place])
        return
      }
      // 글을 먼저 올리고 사진을 올린다. 글 한도에 닿았으면 사진을 올리기 전에 알 수 있다.
      const { error: uploadError } = await server.storage.from(COVER_BUCKET).upload(place, input.cover, { upsert: true, contentType: input.cover.type || 'image/webp', cacheControl: '300' })
      if (uploadError) {
        // 사진을 못 올렸으면 없는 사진을 가리키지 않게 글에서 사진을 뗀다.
        await server.from('posts').update({ cover: null }).eq('user_id', me).eq('column_id', input.columnId)
        throw new FeedError('cover')
      }
    },
    async unpublish(postId) {
      // 글을 지우기 전에 사진의 위치를 알아 둔다.
      const { data: post } = await server.from('posts').select('user_id, column_id').eq('id', postId).maybeSingle()
      const { error } = await server.from('posts').delete().eq('id', postId)
      if (error) throw fail(error)
      // 사진이 없었으면 아무 일도 일어나지 않는다. 사진을 못 지워도 글은 이미 내려갔다.
      if (post) await server.storage.from(COVER_BUCKET).remove([`${post.user_id}/${post.column_id}`])
    },
    async like(postId) {
      const { error } = await server.from('post_likes').insert({ post_id: postId })
      // 23505: 이미 누른 좋아요. 결과가 같으므로 실패로 보지 않는다.
      if (error && error.code !== '23505') throw fail(error)
    },
    async unlike(postId) {
      // 본인 것만 지워진다 (RLS).
      const { error } = await server.from('post_likes').delete().eq('post_id', postId)
      if (error) throw fail(error)
    },
    async comments(postId) {
      // 로그인하지 않은 사람도 읽을 수 있게 함수로 읽는다 (0009_public_read.sql).
      const read = await server.rpc('post_comment_list', { p_post: postId })
      if (!read.error) {
        // parent_id · like_count · liked · deleted 는 0010_comment_threads.sql 부터 온다. 그 전의 서버에서는 답글 없는 한 줄 목록이 된다.
        return ((read.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: text(row.id),
          userId: text(row.user_id),
          nickname: text(row.nickname),
          body: text(row.body),
          createdAt: time(row.created_at),
          parentId: tag(row.parent_id),
          likeCount: count(row.like_count),
          liked: row.liked === true,
          deleted: row.deleted === true,
          avatar: tag(row.avatar),
          hidden: row.hidden === true,
        }))
      }
      if (!isOutdated(read.error)) throw fail(read.error)
      // 서버에 그 함수가 아직 없으면 예전처럼 표에서 읽는다 (가입자만 된다).
      const { data, error } = await server
        .from('post_comments')
        .select('id, user_id, body, created_at, profiles(nickname)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw fail(error)
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: text(row.id),
        userId: text(row.user_id),
        nickname: embeddedNickname(row.profiles),
        body: text(row.body),
        createdAt: time(row.created_at),
        parentId: null,
        likeCount: 0,
        liked: false,
        deleted: false,
        avatar: null,
      }))
    },
    async addComment(postId, body, parentId) {
      // 답글이 아니면 parent_id 칸을 보내지 않는다 (그 칸이 아직 없는 서버에서도 댓글은 달린다).
      const { error } = await server.from('post_comments').insert(parentId ? { post_id: postId, body, parent_id: parentId } : { post_id: postId, body })
      if (error) throw fail(error)
    },
    async likeComment(commentId) {
      const { error } = await server.from('comment_likes').insert({ comment_id: commentId })
      // 23505: 이미 누른 좋아요. 결과가 같으므로 실패로 보지 않는다.
      if (error && error.code !== '23505') throw fail(error)
    },
    async unlikeComment(commentId) {
      // 본인 것만 지워진다 (RLS).
      const { error } = await server.from('comment_likes').delete().eq('comment_id', commentId)
      if (error) throw fail(error)
    },
    async removeComment(commentId) {
      // 답글이 달린 댓글은 자리만 남겨야 하므로 서버 함수로 지운다 (0010_comment_threads.sql).
      const removed = await server.rpc('delete_comment', { p_comment: commentId })
      if (!removed.error) return removed.data === true
      if (!isOutdated(removed.error)) throw fail(removed.error)
      // 서버에 그 함수가 아직 없으면 예전처럼 표에서 지운다 (답글이 없던 때의 방식).
      const { error } = await server.from('post_comments').delete().eq('id', commentId)
      if (error) throw fail(error)
      return true
    },
    async touch() {
      await server.rpc('touch_presence')
    },
  }
}
