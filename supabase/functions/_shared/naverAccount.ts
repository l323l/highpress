// 네이버 로그인 공통 부분: naver-login(웹, 코드를 브라우저가 받음)과 naver-app(앱, 코드를 서버가 받음)이 함께 쓴다.
// 여기에는 Deno 전용 값(Deno.env 등)을 두지 않는다. 비밀값은 부르는 쪽이 읽어 넘긴다 (Node 로도 시험할 수 있게).
// 네이버에서 읽는 것은 회원 식별자 하나뿐이다. 이름 · 이메일 · 사진은 읽지 않고, 네이버 토큰은 쓰고 버린다. IP · 토큰은 기록(log)에 남기지 않는다.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// 네이버로 가입한 계정의 주소 꼴. 실제로 메일을 받는 주소가 아니며 메일을 보내지도 않는다.
// src/features/account/session.ts 의 NAVER_ACCOUNT_SUFFIX 와 같은 값이어야 한다.
export const ACCOUNT_SUFFIX = '@naver.high-press.workers.dev'

// IP 하나가 이 시간 동안 부를 수 있는 횟수
export const RATE_LIMIT = 20
export const RATE_WINDOW_SECONDS = 600
// IP 를 알 수 없는 요청은 한 칸('<범위>:noip')에 모아 느슨하게 센다 (전체가 마비되지 않게 하되 막기는 한다).
export const NOIP_LIMIT = 60
// 네이버에 한 번 물을 때 기다리는 최대 시간
export const NAVER_TIMEOUT_MS = 10_000

export const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

export const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// 받는 값의 꼴
// 네이버 코드
export const isNaverCode = (code: string) => /^[A-Za-z0-9_-]{1,200}$/.test(code)
// verifier: 앱 · 웹이 만드는 무작위 값 (32바이트 → base64url 43자, 넉넉히 128자까지)
export const isVerifier = (verifier: string) => /^[A-Za-z0-9_-]{43,128}$/.test(verifier)
// 앱의 state: base64url(SHA-256(verifier)) 는 늘 43자다. (웹 naver-login 은 예전 꼴 때문에 8 ~ 100자를 받는다)
export const isHashState = (state: string) => /^[A-Za-z0-9_-]{43}$/.test(state)

// state 가 verifier 의 해시인지. 웹 src/features/naver/naverAuth.ts · 앱 mobile/src/auth/naver.ts 의 stateFor() 와 같은 계산이다.
export async function verifierMatches(verifier: string, state: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(digest) === state
}

// 네이버 식별자를 그대로 두지 않고 한쪽으로만 바꾼 값(SHA-256)을 계정 주소로 쓴다.
export async function accountEmail(naverId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`naver:${naverId}`))
  return `n${hex(digest).slice(0, 40)}${ACCOUNT_SUFFIX}`
}

// 요청한 곳의 IP. 호출하는 쪽이 덮어쓸 수 없는 값부터 본다 (M2):
//   cf-connecting-ip(Cloudflare 가 적음) → x-real-ip → x-forwarded-for 의 마지막 값(가장 가까운 프록시가 붙인 값).
//   x-forwarded-for 의 맨 앞 값은 호출하는 쪽이 마음대로 넣을 수 있어 쓰지 않는다.
// 배포 직후 실제 머리글 확인 뒤 하나만 남길 것: Supabase Edge 앞단이 실제로 어떤 머리글을 주는지 로그로 한 번 확인하고,
//   위조할 수 없는 그 하나만 읽도록 이 함수를 줄인다 (지금은 셋을 차례로 본다)
//   (IP 값 자체는 기록하지 말고, 어느 머리글이 있었는지만 본다). 셋 다 없으면 '' 를 돌려주고 'noip' 칸에서 센다.
export function clientIp(req: Request): string {
  const direct = req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim()
  if (direct) return direct
  const chain = (req.headers.get('x-forwarded-for') ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  return chain[chain.length - 1] ?? ''
}

// IP 를 서버 비밀값으로 해시한다. 표에 남는 값으로는 IP 를 되찾을 수 없다.
// scope 는 세는 칸의 이름이다 ('naver-login' 이면 예전과 같은 키가 나온다).
export async function rateKey(scope: string, ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${scope}:${ip}`))
  return `${scope}:${hex(mac).slice(0, 32)}`
}

// 빈도 제한 (0015_app_support.sql 의 bump_rate). 'ok' 면 지나가고, 'limited' 면 429, 'off' 면 503 으로 멈춘다.
// 세지 못하면(0015 를 아직 넣지 않았으면) 제한 없이 열어 두지 않고 멈춘다.
export async function bumpRate(
  admin: SupabaseClient,
  scope: string,
  req: Request,
  secret: string,
  limit = RATE_LIMIT,
): Promise<'ok' | 'limited' | 'off'> {
  const ip = clientIp(req)
  const { data: allowed, error } = await admin.rpc('bump_rate', {
    p_key: ip ? await rateKey(scope, ip, secret) : `${scope}:noip`,
    p_limit: ip ? limit : NOIP_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) return 'off'
  return allowed === true ? 'ok' : 'limited'
}

// 코드를 토큰으로, 토큰을 회원 식별자로. 실패하면 null.
// 네이버에 보내는 state 는 로그인 창을 열 때 쓴 값 그대로다.
// 비밀값이 주소(로그)에 남지 않게 POST 본문(application/x-www-form-urlencoded)으로 보낸다 (L7).
export async function naverIdFromCode(
  code: string,
  state: string,
  clientId: string,
  clientSecret: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const tokenResponse = await fetcher('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, state }),
      signal: AbortSignal.timeout(NAVER_TIMEOUT_MS),
    })
    const token = (await tokenResponse.json()) as { access_token?: unknown }
    if (typeof token.access_token !== 'string' || !token.access_token) return null
    const meResponse = await fetcher('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(NAVER_TIMEOUT_MS),
    })
    const me = (await meResponse.json()) as { resultcode?: unknown; response?: { id?: unknown } }
    if (me.resultcode !== '00' || typeof me.response?.id !== 'string') return null
    const naverId = me.response.id
    return /^[\w.-]{1,128}$/.test(naverId) ? naverId : null
  } catch {
    return null
  }
}

// 식별자로 만든 주소의 계정을 찾거나 만들고, 한 번만 쓸 수 있는 로그인 표(hashed_token)를 낸다.
// 표를 내지 못하면 null. 서버 오류는 던진다 (부르는 쪽이 502 failed 로 바꾼다).
// 받은 쪽은 verifyOtp({ token_hash, type: 'email' }) 로 세션을 만든다 (안 되면 'magiclink' 로 한 번 더).
export async function issueLoginTicket(admin: SupabaseClient, naverId: string): Promise<string | null> {
  const email = await accountEmail(naverId)
  const ticket = async () => {
    const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const hash = data?.properties?.hashed_token
    return typeof hash === 'string' && hash ? hash : null
  }
  let tokenHash = await ticket()
  if (!tokenHash) {
    // 처음 온 사람이다. 계정을 만든 뒤 다시 낸다. (동시에 두 번 눌러 이미 만들어졌어도 다음 줄에서 표가 나온다.)
    await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { via: 'naver' } })
    tokenHash = await ticket()
  }
  return tokenHash
}
