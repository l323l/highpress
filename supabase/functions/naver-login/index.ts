// 네이버 로그인으로 가입 · 로그인 (A-10, APP-PLAN 4.5 · A1-6): 네이버가 확인해 준 사람에게 이 서비스의 로그인을 내준다.
// Supabase 에는 네이버 로그인이 없어서 이 함수가 대신한다. 웹이 부른다 (앱은 naver-app 을 쓴다, 보안 점검 H1). 순서는 이렇다.
//   1. 웹이 무작위 verifier 를 만들고 state = base64url(SHA-256(verifier)) 로 네이버 로그인 창을 연다.
//   2. 네이버 로그인 창에서 받은 코드와 state, 그리고 verifier 를 보낸다: { code, state, verifier }.
//      verifier 의 해시가 state 와 같아야 한다 (아니면 400 bad-verifier). 로그인 창에서 돌아오는 주소(코드)를
//      가로챈 사람은 verifier 를 모르므로 그 코드만으로 로그인하지 못한다.
//   3. 코드를 토큰으로 바꾸고(Client Secret 필요), 그 토큰으로 네이버의 회원 식별자를 읽는다.
//   4. 식별자로 만든 주소의 계정을 찾거나 만들고, 한 번만 쓸 수 있는 로그인 표를 돌려준다.
// 3 · 4 와 빈도 제한은 ../_shared/naverAccount.ts 에 있고 naver-app 과 함께 쓴다.
// 보내는 곳(Origin)은 검사하지 않는다. Origin 은 위조할 수 있어 막는 장치가 되지 못한다.
// 대신 IP(서버 비밀값으로 해시한 값)마다 10분에 20번까지만 받는다 (넘으면 429 rate). 세는 표는 0015_app_support.sql 의 rate_limits.
// H1 (A1 보안 점검): 웹은 https 주소로 코드를 받으므로 이 방식을 그대로 둔다. 앱(커스텀 스킴)은 서버가 코드를 직접 받는
//   naver-app 으로 옮겼다 (요청자 결정 2026-10-24). 이 함수는 앱이 예전 판으로 불러도 지금처럼 동작한다.
// 비밀값: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, APP_ORIGINS (APP_ORIGINS 는 브라우저 CORS 응답 머리글에만 쓴다).
// 로그인하기 전에 부르는 함수라서 --no-verify-jwt 로 올린다: supabase functions deploy naver-login --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { bumpRate, isNaverCode, issueLoginTicket, isVerifier, naverIdFromCode, verifierMatches } from '../_shared/naverAccount.ts'

function allowedOrigins(): string[] {
  return (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
}

// 브라우저가 응답을 읽을 수 있게 하는 머리글. 막는 데는 쓰지 않는다 (앱은 Origin 이 없다).
function corsHeaders(req: Request): Record<string, string> {
  const allowed = allowedOrigins()
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return send(405, { error: 'method' })

  const clientId = Deno.env.get('NAVER_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !clientSecret || !serviceKey) return send(503, { error: 'off' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // ── 0. 빈도 제한: 몸통을 읽기 전에 센다 (틀린 요청도 센다) ────────────────
  // 세지 못하면(0015 를 아직 넣지 않았으면) 제한 없이 열어 두지 않고 503 off 로 멈춘다. 운영자는 0015 를 넣은 뒤 이 함수를 올린다.
  // 세는 칸 이름 'naver-login' 은 예전과 같다 (공통 모듈로 옮겨도 키가 바뀌지 않는다).
  const rate = await bumpRate(admin, 'naver-login', req, clientSecret)
  if (rate === 'off') return send(503, { error: 'off' })
  if (rate === 'limited') return send(429, { error: 'rate' })

  let input: { code?: unknown; state?: unknown; verifier?: unknown }
  try {
    input = await req.json()
  } catch {
    return send(400, { error: 'bad-request' })
  }
  const code = typeof input.code === 'string' ? input.code : ''
  const state = typeof input.state === 'string' ? input.state : ''
  const verifier = typeof input.verifier === 'string' ? input.verifier : ''
  if (!isNaverCode(code) || !/^[A-Za-z0-9_-]{8,100}$/.test(state)) return send(400, { error: 'bad-request' })
  if (!isVerifier(verifier) || !(await verifierMatches(verifier, state))) return send(400, { error: 'bad-verifier' })

  // ── 1. 코드를 토큰으로, 토큰을 회원 식별자로 ──────────────────────────────
  const naverId = await naverIdFromCode(code, state, clientId, clientSecret)
  if (!naverId) return send(502, { error: 'naver-login' })

  // ── 2. 계정을 찾거나 만들고, 한 번 쓰는 로그인 표를 낸다 ──────────────────
  try {
    const tokenHash = await issueLoginTicket(admin, naverId)
    if (!tokenHash) return send(502, { error: 'failed' })
    return send(200, { tokenHash })
  } catch {
    return send(502, { error: 'failed' })
  }
})
