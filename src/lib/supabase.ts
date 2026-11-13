import type { SupabaseClient } from '@supabase/supabase-js'

// 서버(Supabase)는 선택 사항이다. 설정이 없으면 앱은 기기 저장만으로 동작한다.
// 브라우저에는 공개(anon) 키만 들어간다. 다른 키는 여기에 두지 않는다 (SEC-2).
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const SERVER_URL = /^https:\/\/[\w.-]+$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url) ? url : ''
// 서버 함수를 직접 부를 때 함께 보내는 공개 키
export const SERVER_ANON_KEY = anonKey
export const serverConfigured = SERVER_URL !== '' && anonKey !== ''

let client: Promise<SupabaseClient> | null = null

// 서버를 쓸 때만 라이브러리를 불러온다. 설정이 없으면 null.
export function getServer(): Promise<SupabaseClient> | null {
  if (!serverConfigured) return null
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SERVER_URL, anonKey, { auth: { flowType: 'pkce' } }))
  return client
}
