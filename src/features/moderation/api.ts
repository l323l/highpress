import type { SupabaseClient } from '@supabase/supabase-js'
import { getServer } from '../../lib/supabase'

// 신고 · 차단 · 운영자 처리 (APP-PRD 8.1, APP-PLAN 4.5). 서버 함수는 supabase/migrations/0014_moderation.sql.
// 이 파일은 서버와 화면 사이의 규약이다. 함수 이름 · 인자 · 오류 코드를 바꾸려면 APP-PLAN 4.5부터 고친다.

// 무엇을 신고하는지. 대표 사진은 글(post), 프로필 사진은 사용자(user)로 신고하고 part 로 구분한다.
export type ReportKind = 'post' | 'comment' | 'user'
export type ReportPart = 'cover' | 'avatar'
export type ReportReason = 'spam' | 'abuse' | 'hate' | 'sexual' | 'illegal' | 'other'

export const REPORT_REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: 'spam', label: '광고 · 도배' },
  { id: 'abuse', label: '욕설 · 괴롭힘' },
  { id: 'hate', label: '혐오 · 차별' },
  { id: 'sexual', label: '음란물 · 성적인 내용' },
  { id: 'illegal', label: '불법 · 개인정보 노출' },
  { id: 'other', label: '그 밖에' },
]

export const MODERATION_LIMITS = { detail: 300, reportsPerDay: 30, blocks: 500, bannedWord: 30 } as const

// 서로 다른 사람이 이만큼 신고하면 서버가 바로 숨긴다 (D10).
export const AUTO_HIDE_REPORTS = 3

// 글쓴이가 자기 글 · 댓글이 숨겨졌을 때 보는 문구 (2026-10-17 인터뷰).
export const HIDDEN_NOTICE = '신고가 여러 건 접수돼 다른 사람에게 보이지 않습니다. 운영자가 확인한 뒤 다시 보이거나 삭제됩니다.'

// 서버 오류 메시지(raise exception)와 같은 이름이다.
//   not_member: 로그인 · 가입 전, self: 자기 자신을 신고 · 차단, already: 이미 신고함,
//   quota: 하루 신고 30건 · 차단 500명, suspended: 이용이 정지된 계정, not_admin: 운영자가 아님,
//   outdated: 서버에 0014가 아직 없음
export type ModerationErrorCode = 'not_member' | 'self' | 'already' | 'quota' | 'suspended' | 'not_admin' | 'outdated' | 'failed'

export class ModerationError extends Error {
  readonly code: ModerationErrorCode

  constructor(code: ModerationErrorCode) {
    super(code)
    this.code = code
  }
}

export const MODERATION_ERROR_TEXT: Record<ModerationErrorCode, string> = {
  not_member: '로그인하고 가입을 마친 뒤 쓸 수 있습니다.',
  self: '자기 자신에게는 할 수 없습니다.',
  already: '이미 신고했습니다. 운영자가 확인하고 있습니다.',
  quota: '오늘은 더 할 수 없습니다. 내일 다시 시도해 주세요.',
  suspended: '이용이 정지된 계정입니다.',
  not_admin: '운영자만 할 수 있습니다.',
  outdated: '서버가 아직 이 기능을 지원하지 않습니다.',
  failed: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export interface BlockedPerson {
  userId: string
  nickname: string
  avatar: string | null
  // 차단한 시각 (ms)
  blockedAt: number
}

// 운영 화면의 신고 한 건. 같은 대상에 대한 신고를 하나로 묶는다.
export interface ReportGroup {
  kind: ReportKind
  targetId: string
  parts: ReportPart[]
  // 사유별 건수
  reasons: Partial<Record<ReportReason, number>>
  reportCount: number
  firstAt: number
  lastAt: number
  hidden: boolean
  // 글 제목 · 댓글 · 닉네임 앞부분 (최대 120자)
  preview: string
  authorId: string
  authorNickname: string
  authorSuspended: boolean
  // 글이면 글 주소를 만들 때 쓴다. 그 밖에는 null.
  postId: string | null
  // 신고한 사람들이 적은 자세한 내용. 최근 것부터 최대 3개 (각 300자).
  details: string[]
}

// restore: 다시 보이게, delete: 지우기, suspend: 글쓴이 이용 정지 + 대상 숨김, dismiss: 문제없음으로 닫기
export type ReportAction = 'restore' | 'delete' | 'suspend' | 'dismiss'
export type ReportStatus = 'open' | 'closed'

export interface ModerationRemote {
  report(input: { kind: ReportKind; targetId: string; reason: ReportReason; detail?: string; part?: ReportPart }): Promise<void>
  block(userId: string): Promise<void>
  unblock(userId: string): Promise<void>
  blocks(): Promise<BlockedPerson[]>
  // 아래는 운영자만
  reports(status: ReportStatus): Promise<ReportGroup[]>
  resolve(kind: ReportKind, targetId: string, action: ReportAction): Promise<void>
  unsuspend(userId: string): Promise<void>
  bannedWords(): Promise<string[]>
  addBannedWord(word: string): Promise<void>
  removeBannedWord(word: string): Promise<void>
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const count = (value: unknown): number => Math.max(0, Number(value) || 0)
const time = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) || 0 : 0)
const tag = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

const OUTDATED = ['PGRST202', 'PGRST204', 'PGRST205', '42703', '42P01', '42883']

export function moderationFail(error: { message: string; code?: string }): ModerationError {
  const message = error.message
  if (/not_member/.test(message)) return new ModerationError('not_member')
  if (/self_report|self_block/.test(message)) return new ModerationError('self')
  if (/already_reported/.test(message) || error.code === '23505') return new ModerationError('already')
  if (/report_quota|block_quota/.test(message)) return new ModerationError('quota')
  if (/suspended/.test(message)) return new ModerationError('suspended')
  if (/not_admin/.test(message)) return new ModerationError('not_admin')
  if (OUTDATED.includes(error.code ?? '')) return new ModerationError('outdated')
  return new ModerationError('failed')
}

function toGroup(row: Record<string, unknown>): ReportGroup {
  const reasons = (row.reasons && typeof row.reasons === 'object' ? row.reasons : {}) as Record<string, unknown>
  return {
    kind: text(row.kind) as ReportKind,
    targetId: text(row.target_id),
    parts: Array.isArray(row.parts) ? (row.parts.filter((part) => part === 'cover' || part === 'avatar') as ReportPart[]) : [],
    reasons: Object.fromEntries(Object.entries(reasons).map(([key, value]) => [key, count(value)])),
    reportCount: count(row.report_count),
    firstAt: time(row.first_at),
    lastAt: time(row.last_at),
    hidden: row.hidden === true,
    preview: text(row.preview),
    authorId: text(row.author_id),
    authorNickname: text(row.author_nickname),
    authorSuspended: row.author_suspended === true,
    postId: tag(row.post_id),
    details: Array.isArray(row.details) ? row.details.map(text).filter(Boolean).slice(0, 3) : [],
  }
}

export function createModerationRemote(server: SupabaseClient): ModerationRemote {
  const call = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await server.rpc(fn, args)
    if (error) throw moderationFail(error)
    return data as unknown
  }
  return {
    async report({ kind, targetId, reason, detail, part }) {
      const note = (detail ?? '').trim().slice(0, MODERATION_LIMITS.detail)
      await call('report_content', { p_kind: kind, p_target: targetId, p_reason: reason, p_detail: note || null, p_part: part ?? null })
    },
    async block(userId) {
      await call('block_user', { p_user: userId })
    },
    async unblock(userId) {
      await call('unblock_user', { p_user: userId })
    },
    async blocks() {
      const rows = (await call('my_blocks')) as Record<string, unknown>[] | null
      return (rows ?? []).map((row) => ({ userId: text(row.user_id), nickname: text(row.nickname), avatar: tag(row.avatar), blockedAt: time(row.blocked_at) }))
    },
    async reports(status) {
      const rows = (await call('admin_reports', { p_status: status })) as Record<string, unknown>[] | null
      return (rows ?? []).map(toGroup)
    },
    async resolve(kind, targetId, action) {
      await call('admin_resolve_report', { p_kind: kind, p_target: targetId, p_action: action })
    },
    async unsuspend(userId) {
      await call('admin_unsuspend', { p_user: userId })
    },
    async bannedWords() {
      const rows = (await call('admin_banned_words')) as unknown[] | null
      return (rows ?? []).map(text).filter(Boolean)
    },
    async addBannedWord(word) {
      await call('admin_add_banned_word', { p_word: word.trim().slice(0, MODERATION_LIMITS.bannedWord) })
    },
    async removeBannedWord(word) {
      await call('admin_remove_banned_word', { p_word: word })
    },
  }
}

// 서버 설정이 없으면 null.
export async function getModerationRemote(): Promise<ModerationRemote | null> {
  const server = await getServer()
  return server ? createModerationRemote(server) : null
}
