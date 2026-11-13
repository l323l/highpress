// 네이버 카페 직접 게시 (N-1 ~ N-6): 네이버 로그인 토큰을 받아 주고, 글과 사진을 네이버 카페로 넘긴다.
// 브라우저는 네이버 API 를 직접 부를 수 없고(CORS), Client Secret 을 브라우저에 둘 수 없어서 이 함수를 거친다.
// 비밀값: supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...
// 아무것도 저장하지 않는다. 토큰·글·사진은 네이버로 넘긴 뒤 버린다. 기록(log)에도 남기지 않는다.
// 로그인 코드 교환은 naver-login 과 같이 { code, state, verifier } 를 받고, base64url(SHA-256(verifier)) === state 가
// 아니면 400 bad-verifier 로 거절한다 (A1 보안 점검 M1. 가로챈 코드만으로는 토큰을 받지 못하게).
// H1: 네이버가 토큰 교환 때 state 를 처음 연 창의 값과 대조하는지는 A2-8 실기기 실측 뒤 결정한다. 지금 코드는 바꾸지 않는다.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cafeMultipart, isCafeImageType, readCafeResult, type CafeImage } from './cafe.ts'

// src/features/naver/limits.ts 와 같은 값이어야 한다.
const MAX_SUBJECT = 100
const MAX_CONTENT_BYTES = 400_000
const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 3_000_000
const MAX_TOTAL_BYTES = 12_000_000
// 네이버 로그인 · 토큰 요청을 기다리는 최대 시간
const NAVER_TIMEOUT_MS = 10_000
// 카페 글 올리기는 사진(최대 12MB)을 함께 보내므로 조금 더 기다린다
const CAFE_UPLOAD_TIMEOUT_MS = 30_000

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// state 가 verifier 의 해시인지 (naver-login 과 같은 계산, 웹 src/features/naver/naverAuth.ts 의 stateFor()).
async function verifierMatches(verifier: string, state: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(digest) === state
}

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

const text = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '')

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return send(405, { error: 'method' })

  const clientId = Deno.env.get('NAVER_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!clientId || !clientSecret) return send(503, { error: 'off' })

  // 가입한 사람만 쓴다 (로그인했고 프로필이 있다).
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return send(401, { error: 'login' })
  const { data: profile } = await asUser.from('profiles').select('user_id').eq('user_id', auth.user.id).maybeSingle()
  if (!profile) return send(403, { error: 'member' })

  const type = req.headers.get('Content-Type') ?? ''

  // ── 1. 로그인 코드를 토큰으로 바꾼다 ──────────────────────────────────────
  if (type.startsWith('application/json')) {
    let input: { code?: unknown; state?: unknown; verifier?: unknown }
    try {
      input = await req.json()
    } catch {
      return send(400, { error: 'bad-request' })
    }
    const code = typeof input.code === 'string' ? input.code : ''
    const state = typeof input.state === 'string' ? input.state : ''
    const verifier = typeof input.verifier === 'string' ? input.verifier : ''
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(code) || !/^[A-Za-z0-9_-]{8,100}$/.test(state)) return send(400, { error: 'bad-request' })
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier) || !(await verifierMatches(verifier, state))) return send(400, { error: 'bad-verifier' })
    try {
      // 비밀값이 주소(로그)에 남지 않게 POST 본문으로 보낸다 (L7).
      const response = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, state }),
        signal: AbortSignal.timeout(NAVER_TIMEOUT_MS),
      })
      const token = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
      if (typeof token.access_token !== 'string' || !token.access_token) return send(502, { error: 'naver-login' })
      return send(200, { token: token.access_token, expiresIn: Number(token.expires_in) || 3600 })
    } catch {
      return send(502, { error: 'naver-login' })
    }
  }

  // ── 2. 글과 사진을 카페에 올린다 ──────────────────────────────────────────
  if (!type.startsWith('multipart/form-data')) return send(400, { error: 'bad-request' })
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_TOTAL_BYTES + 100_000) return send(413, { error: 'too-big' })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return send(400, { error: 'bad-request' })
  }
  const token = text(form.get('token'))
  const clubId = text(form.get('clubId'))
  const menuId = text(form.get('menuId'))
  const subject = text(form.get('subject')).replace(/[\r\n\t]+/g, ' ').trim()
  const content = text(form.get('content'))
  // 카페와 게시판은 숫자만 받는다. 이 값이 주소에 들어가므로 다른 곳으로 요청이 새지 않게 한다.
  if (!/^[A-Za-z0-9_-]{10,400}$/.test(token) || !/^\d{1,12}$/.test(clubId) || !/^\d{1,9}$/.test(menuId)) return send(400, { error: 'bad-request' })
  if (!subject || subject.length > MAX_SUBJECT || !content || new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) return send(400, { error: 'bad-request' })

  const images: CafeImage[] = []
  let total = 0
  for (const entry of form.getAll('image')) {
    if (!(entry instanceof File)) return send(400, { error: 'bad-request' })
    if (!isCafeImageType(entry.type) || entry.size === 0 || entry.size > MAX_IMAGE_BYTES) return send(400, { error: 'bad-image' })
    total += entry.size
    if (images.length >= MAX_IMAGES || total > MAX_TOTAL_BYTES) return send(413, { error: 'too-big' })
    images.push({ type: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) })
  }

  const boundary = `----hp${crypto.randomUUID().replaceAll('-', '')}`
  try {
    const response = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/menu/${menuId}/articles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: cafeMultipart(subject, content, images, boundary),
      signal: AbortSignal.timeout(CAFE_UPLOAD_TIMEOUT_MS),
    })
    const result = readCafeResult(response.status, await response.text())
    if (result.ok) return send(200, { url: result.url })
    return send(result.reason === 'too-fast' ? 429 : result.reason === 'login' ? 401 : 502, { error: result.reason === 'login' ? 'naver-login' : result.reason, detail: result.detail })
  } catch {
    return send(502, { error: 'failed', detail: '' })
  }
})
