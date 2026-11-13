// 앱의 네이버 로그인: 서버가 네이버 코드를 직접 받는다 (보안 점검 H1, 요청자 결정 2026-10-24, APP-PRD 7장 · APP-PLAN 4.5).
// 여기에는 Deno 전용 값을 두지 않는다 (index.ts 가 비밀값을 읽어 넘긴다). 그래서 Node 로 시험한다: supabase/tests/naver_app.test.ts
//
// 경로 둘:
//   GET  /functions/v1/naver-app/callback?code=…&state=…  네이버가 브라우저를 여기로 보낸다 (네이버 개발자센터의 Callback URL).
//        state 꼴(43자) → 코드를 토큰으로 → 계정 찾기 · 만들기 → 로그인 표를 naver_app_pending 에 state 이름으로 2분 둔다.
//        끝나면 브라우저를 highpress://auth/callback?naver=1&state=<state> 로 보낸다 (실패면 ?naver=1&error=<짧은 코드>).
//        앱 주소에는 코드도 로그인 표도 싣지 않는다. 그 주소를 다른 앱이 가로채도 얻는 것은 state(verifier 의 해시)뿐이다.
//   POST /functions/v1/naver-app/claim  { state, verifier }
//        base64url(SHA-256(verifier)) == state 를 먼저 확인하고(틀리면 400 bad-verifier, 행은 건드리지 않는다),
//        그 행을 꺼내면서 지운다 (한 번만, 만료 확인). 없거나 만료면 404 expired. 맞으면 200 { tokenHash, type }.
// 두 경로 모두 IP(서버 비밀값으로 해시한 값)마다 10분에 20번까지 (naver-login 과 같은 방식, 칸 이름만 다르다).
// 돌려보내는 오류 코드: cancelled(사용자가 네이버에서 취소) · rate · off(서버 설정 · 표가 아직 없음) · bad-request · naver(네이버가 거절) · used(같은 state 가 이미 있음) · failed.
// 코드 · 토큰 · IP 는 기록(log)에 남기지 않는다.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { bumpRate, isHashState, isNaverCode, isVerifier, issueLoginTicket, naverIdFromCode, verifierMatches } from '../_shared/naverAccount.ts'

// 앱으로 돌아가는 주소. mobile/src/auth/redirect.ts 의 AUTH_REDIRECT 와 같아야 한다.
export const APP_CALLBACK = 'highpress://auth/callback'
// 빈도 제한 칸 이름 (naver-login 과 따로 센다)
export const RATE_SCOPE_CALLBACK = 'naver-app-callback'
export const RATE_SCOPE_CLAIM = 'naver-app-claim'
// 앱이 verifyOtp 에 넘길 종류. 웹(src/features/account/session.ts)과 같이 'email' 을 먼저 쓴다.
export const TICKET_KIND = 'email'

export type CallbackError = 'cancelled' | 'rate' | 'off' | 'bad-request' | 'naver' | 'used' | 'failed'

export interface NaverAppContext {
  clientId: string
  clientSecret: string
  // 서버 비밀값이 모자라면 null (503 off / error=off)
  admin: SupabaseClient | null
  fetcher?: typeof fetch
  now?: () => number
}

// 주소의 마지막 칸으로 경로를 고른다. Supabase 는 /naver-app/… 로 넘겨준다 (앞에 /functions/v1 이 붙어 와도 된다).
export function routeOf(pathname: string): 'callback' | 'claim' | null {
  const last = pathname.replace(/\/+$/, '').split('/').pop()
  return last === 'callback' || last === 'claim' ? last : null
}

// 앱으로 돌아가는 주소. 성공이면 state 만, 실패면 짧은 오류 코드만 싣는다.
export function appRedirect(result: { state: string } | { error: CallbackError }): string {
  const query = new URLSearchParams({ naver: '1' })
  if ('state' in result) query.set('state', result.state)
  else query.set('error', result.error)
  return `${APP_CALLBACK}?${query.toString()}`
}

// 네이버가 보낸 error 를 짧은 코드로. 사용자가 동의하지 않거나 취소하면 access_denied 가 온다.
export function callbackErrorOf(naverError: string): CallbackError {
  return naverError === 'access_denied' ? 'cancelled' : 'naver'
}

// 꺼낸 행이 아직 살아 있는지 (표에서도 확인하지만 한 번 더 본다).
export function stillValid(expiresAt: unknown, now: number): boolean {
  const at = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN
  return Number.isFinite(at) && at > now
}

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

async function handleCallback(req: Request, ctx: NaverAppContext): Promise<Response> {
  const fail = (error: CallbackError) => redirect(appRedirect({ error }))
  const { admin } = ctx
  if (!admin || !ctx.clientId || !ctx.clientSecret) return fail('off')

  const rate = await bumpRate(admin, RATE_SCOPE_CALLBACK, req, ctx.clientSecret)
  if (rate === 'off') return fail('off')
  if (rate === 'limited') return fail('rate')

  const params = new URL(req.url).searchParams
  const naverError = params.get('error')
  if (naverError) return fail(callbackErrorOf(naverError))
  const code = params.get('code') ?? ''
  const state = params.get('state') ?? ''
  if (!isHashState(state) || !isNaverCode(code)) return fail('bad-request')

  const naverId = await naverIdFromCode(code, state, ctx.clientId, ctx.clientSecret, ctx.fetcher ?? fetch)
  if (!naverId) return fail('naver')

  let tokenHash: string | null
  try {
    tokenHash = await issueLoginTicket(admin, naverId)
  } catch {
    return fail('failed')
  }
  if (!tokenHash) return fail('failed')

  const { data: added, error } = await admin.rpc('naver_app_put', { p_state: state, p_token_hash: tokenHash, p_kind: TICKET_KIND })
  if (error) return fail('off')
  if (added !== true) return fail('used')
  return redirect(appRedirect({ state }))
}

async function handleClaim(req: Request, ctx: NaverAppContext): Promise<Response> {
  const { admin } = ctx
  if (!admin || !ctx.clientSecret) return json(503, { error: 'off' })

  // 몸통을 읽기 전에 센다 (틀린 요청도 센다).
  const rate = await bumpRate(admin, RATE_SCOPE_CLAIM, req, ctx.clientSecret)
  if (rate === 'off') return json(503, { error: 'off' })
  if (rate === 'limited') return json(429, { error: 'rate' })

  let input: { state?: unknown; verifier?: unknown }
  try {
    input = await req.json()
  } catch {
    return json(400, { error: 'bad-request' })
  }
  const state = typeof input?.state === 'string' ? input.state : ''
  const verifier = typeof input?.verifier === 'string' ? input.verifier : ''
  if (!isHashState(state)) return json(400, { error: 'bad-request' })
  // verifier 를 먼저 본다. 틀린 verifier 로는 행을 꺼내지도 지우지도 못한다.
  if (!isVerifier(verifier) || !(await verifierMatches(verifier, state))) return json(400, { error: 'bad-verifier' })

  const { data: taken, error } = await admin.rpc('naver_app_take', { p_state: state })
  if (error) return json(503, { error: 'off' })
  const row = taken as { token_hash?: unknown; kind?: unknown; expires_at?: unknown } | null
  if (!row || typeof row.token_hash !== 'string' || !row.token_hash) return json(404, { error: 'expired' })
  if (!stillValid(row.expires_at, (ctx.now ?? Date.now)())) return json(404, { error: 'expired' })
  return json(200, { tokenHash: row.token_hash, type: row.kind === 'magiclink' ? 'magiclink' : 'email' })
}

export async function handle(req: Request, ctx: NaverAppContext): Promise<Response> {
  const route = routeOf(new URL(req.url).pathname)
  if (route === 'callback' && req.method === 'GET') return handleCallback(req, ctx)
  if (route === 'claim' && req.method === 'POST') return handleClaim(req, ctx)
  if (route) return json(405, { error: 'method' })
  return json(404, { error: 'not-found' })
}
