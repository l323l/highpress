import type { SupabaseClient } from '@supabase/supabase-js'
import { getServer } from '../../lib/supabase'
import type { ReportGroup } from './api'
import { requireModeration } from './errors'

// 신고된 대상을 지울 때 함께 지울 사진. 서버 함수(SQL)는 보관함의 파일을 지우지 못하므로 화면이 지운다.
// 글은 대표 사진(post-covers), 사용자는 프로필 사진(avatars). 댓글에는 사진이 없다.
export interface ReportedMedia {
  bucket: 'post-covers' | 'avatars'
  path: string
}

const where = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

// 지우기 전에 사진 위치를 읽는다 (운영자는 숨긴 행 · 숨긴 프로필 사진도 읽힌다). 읽지 못하면 null.
export async function findReportedMedia(server: SupabaseClient, group: Pick<ReportGroup, 'kind' | 'targetId'>): Promise<ReportedMedia | null> {
  try {
    if (group.kind === 'post') {
      const { data, error } = await server.from('posts').select('cover').eq('id', group.targetId).maybeSingle()
      const path = error ? null : where((data as { cover?: unknown } | null)?.cover)
      return path ? { bucket: 'post-covers', path } : null
    }
    if (group.kind === 'user') {
      const { data, error } = await server.rpc('profile_summary', { p_user: group.targetId })
      const row = error ? undefined : ((data ?? []) as Record<string, unknown>[])[0]
      const path = where(row?.avatar)
      return path ? { bucket: 'avatars', path } : null
    }
  } catch {
    // 사진을 찾지 못해도 지우기는 계속한다.
  }
  return null
}

// 지운 결과. 행은 지웠지만 사진 파일을 지우지 못했으면 leftover 에 그 파일이 있다 (운영자가 직접 지우게 알린다).
export interface DeleteResult {
  leftover: ReportedMedia | null
}

// 신고된 대상을 지우고, 딸린 사진도 보관함에서 지운다.
// 행 삭제(resolve)가 실패하면 오류를 그대로 올린다. 사진 정리가 실패해도 행 삭제는 성공으로 두고 남은 파일을 돌려준다.
// storage.remove() 는 실패해도 throw 하지 않고 { error } 를 돌려주므로 둘 다 본다.
export async function deleteReported(group: Pick<ReportGroup, 'kind' | 'targetId'>): Promise<DeleteResult> {
  const server = await getServer()
  const media = server ? await findReportedMedia(server, group) : null
  const remote = await requireModeration()
  await remote.resolve(group.kind, group.targetId, 'delete')
  if (!server || !media) return { leftover: null }
  try {
    const { error } = await server.storage.from(media.bucket).remove([media.path])
    return { leftover: error ? media : null }
  } catch {
    return { leftover: media }
  }
}
