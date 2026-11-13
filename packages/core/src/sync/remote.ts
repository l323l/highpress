import type { SupabaseClient } from '@supabase/supabase-js'
import type { JSONContent } from '../body/json'

// 서버에 두는 초안 사본. 글만 있고 사진은 없다 (SB-1, SB-5).
export interface RemoteDraft {
  id: string
  title: string
  body: JSONContent
  // 기기에서 마지막으로 고친 시각 (ms)
  clientUpdatedAt: number
}

// 서버가 할당량(초안 3개, 본문 1MB)을 이유로 거절했다 (SB-6).
export class QuotaError extends Error {
  constructor() {
    super('quota')
  }
}

export interface DraftRemote {
  list(): Promise<RemoteDraft[]>
  upsert(draft: RemoteDraft): Promise<void>
  remove(id: string): Promise<void>
}

interface Row {
  id: unknown
  title: unknown
  body: unknown
  client_updated_at: unknown
}

// draft_quota: 초안 3편 초과, server_full: 서버 DB가 한도에 닿아 새 초안을 받지 않음, 23514: 본문 크기 등 check 제약 위반
const isQuota = (error: { message: string; code?: string }) => /draft_quota|server_full/.test(error.message) || error.code === '23514'

export function createRemote(server: SupabaseClient): DraftRemote {
  return {
    async list() {
      const { data, error } = await server.from('drafts').select('id, title, body, client_updated_at')
      if (error) throw new Error('list failed')
      return ((data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        title: typeof row.title === 'string' ? row.title : '',
        body: row.body as JSONContent,
        clientUpdatedAt: Number(row.client_updated_at) || 0,
      }))
    },
    async upsert(draft) {
      // user_id는 서버가 로그인한 사용자로 채운다. RLS가 남의 행을 막는다.
      const { error } = await server
        .from('drafts')
        .upsert({ id: draft.id, title: draft.title, body: draft.body, client_updated_at: draft.clientUpdatedAt }, { onConflict: 'user_id,id' })
      if (error) throw isQuota(error) ? new QuotaError() : new Error('upsert failed')
    },
    async remove(id) {
      const { error } = await server.from('drafts').delete().eq('id', id)
      if (error) throw new Error('delete failed')
    },
  }
}
