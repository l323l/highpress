// 회원 탈퇴 (A-3, APP-PRD 8.1 · APP-PLAN 4.5 · A1-7): 사진 → 계정 순서를 서버 한곳에서 처리한다.
// 예전에는 화면이 사진을 먼저 지우고 계정을 지웠다. 중간에 실패하면 사진이 남았고, 계정이 먼저 없어지면 지울 권한도 없어졌다.
// 순서는 이렇다.
//   1. 로그인 토큰(Authorization: Bearer <access token>)으로 누구인지 확인한다. 남의 계정은 지울 수 없다.
//   2. Apple 로 가입한 계정이면 Apple 토큰을 취소한다 (A3 에서 채운다. 지금은 자리만 있다).
//   3. 보관함의 post-covers/<내 id>/ · avatars/<내 id>/ 파일을 지운다. 하나라도 못 지우면 계정을 지우지 않고 멈춘다 (다시 누르면 이어서 한다).
//   4. 계정을 지운다. 프로필 · 초안 · 글 · 댓글 · 좋아요 · 팔로우 · 신고 · 차단은 데이터베이스가 함께 지운다 (on delete cascade).
//   5. 두 폴더를 한 번 더 비운다 (3과 4 사이에 올라온 사진이 남지 않게).
//   정지된 계정의 로그인 수단 해시(banned_identities)는 지우지 않는다. 다시 가입해도 정지가 이어진다 (0014, M7).
// 응답: { ok: true } 또는 { error: 'login' | 'off' | 'storage' | 'failed' | 'method' }
// 로그인 토큰 검사를 켠 채로 올린다: supabase functions deploy account-delete
// 비밀값: 따로 없다 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 넣어 준다). CORS 는 APP_ORIGINS 를 쓴다 (feedback 과 같다).
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'

// 사용자가 사진을 두는 보관함과 한 사람이 둘 수 있는 장수 (0008_cover.sql 20장, 0011_avatar.sql 3장)
const BUCKETS = ['post-covers', 'avatars'] as const
const PAGE = 100
// 한 보관함에서 지우기를 되풀이하는 최대 횟수 (한 번에 100개씩)
const MAX_ROUNDS = 5

// 앱이 올라간 주소만 허용한다. 여러 개면 쉼표로 구분: supabase secrets set APP_ORIGINS=https://example.pages.dev,http://localhost:5173
function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// Apple 로 가입했거나 Apple 을 이어 둔 계정인지.
function isAppleAccount(user: User): boolean {
  const meta = (user.app_metadata ?? {}) as { provider?: unknown; providers?: unknown }
  if (meta.provider === 'apple') return true
  if (Array.isArray(meta.providers) && meta.providers.includes('apple')) return true
  return (user.identities ?? []).some((identity) => identity.provider === 'apple')
}

// TODO(A3): Apple 토큰 취소 (https://appleid.apple.com/auth/revoke).
// .p8 키 · Key ID · Team ID · 서비스 ID 를 Supabase 비밀값으로 받아 client_secret(JWT)을 만들고, 사용자의 refresh token 을 취소한다.
// 지금은 아무것도 하지 않는다. 실패해도 탈퇴를 막지 않을지는 A3 에서 정한다.
async function revokeApple(_user: User): Promise<void> {
  // 자리만 둔다.
}

// 한 보관함의 <uid>/ 폴더를 비운다. 다 지웠으면 true.
async function emptyFolder(admin: SupabaseClient, bucket: string, uid: string): Promise<boolean> {
  const files = admin.storage.from(bucket)
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await files.list(uid, { limit: PAGE })
    if (error) {
      // 보관함이 아직 없는 서버(0008 · 0011 전)면 지울 것도 없다.
      return /not found/i.test(error.message)
    }
    const paths = (data ?? []).filter((item) => item.id !== null).map((item) => `${uid}/${item.name}`)
    if (paths.length === 0) return true
    const { error: removeError } = await files.remove(paths)
    if (removeError) return false
  }
  return false
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return send(405, { error: 'method' })

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !serviceKey) return send(503, { error: 'off' })

  // ── 1. 누구인지: 로그인 토큰을 Auth 서버에 물어 확인한다 ──────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return send(401, { error: 'login' })
  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  const user = auth?.user
  if (authError || !user) return send(401, { error: 'login' })
  const uid = user.id

  // ── 2. Apple 토큰 취소 (A3) ──────────────────────────────────────────────
  if (isAppleAccount(user)) await revokeApple(user)

  // ── 3. 사진 파일 ─────────────────────────────────────────────────────────
  for (const bucket of BUCKETS) {
    if (!(await emptyFolder(admin, bucket, uid))) {
      console.error('account-delete storage failed', bucket)
      return send(502, { error: 'storage' })
    }
  }

  // ── 4. 계정 ──────────────────────────────────────────────────────────────
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
  if (deleteError) {
    console.error('account-delete user failed', deleteError.message)
    return send(502, { error: 'failed' })
  }

  // ── 5. 한 번 더 비운다 (L8) ──────────────────────────────────────────────
  // 3번과 4번 사이에 다른 탭 · 기기에서 사진을 올렸으면 남을 수 있다. 계정은 이미 지워졌으므로 실패해도 결과는 ok 로 둔다.
  for (const bucket of BUCKETS) {
    if (!(await emptyFolder(admin, bucket, uid))) console.error('account-delete storage sweep failed', bucket)
  }
  return send(200, { ok: true })
})
