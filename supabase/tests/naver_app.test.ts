// naver-app 함수 · 네이버 로그인 공통 모듈 시험. Deno 없이 Node 로 돈다 (Deno 전용 값은 index.ts 에만 있다).
//   node --test supabase/tests/naver_app.test.ts
// 서버(Supabase)와 네이버는 가짜로 둔다. 원격에 연결하지 않는다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appRedirect, callbackErrorOf, handle, routeOf, stillValid } from '../functions/naver-app/handler.ts'
import { clientIp, isHashState, rateKey, verifierMatches } from '../functions/_shared/naverAccount.ts'

const BASE = 'https://example.supabase.co/functions/v1/naver-app'
// RFC 7636 부록 B 의 예: verifier → base64url(SHA-256(verifier))
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const STATE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const OTHER_VERIFIER = 'A'.repeat(43)

type Row = { token_hash: string; kind: string; expires_at: number }

// 가짜 서버: bump_rate · naver_app_put · naver_app_take 와 계정 함수만 흉내 낸다.
function fakeServer(options: { rate?: 'ok' | 'limited' | 'off'; table?: 'ok' | 'missing'; now?: () => number } = {}) {
  const now = options.now ?? Date.now
  const rows = new Map<string, Row>()
  const users = new Set<string>()
  const rateKeys: string[] = []
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'bump_rate') {
        rateKeys.push(String(args.p_key))
        if (options.rate === 'off') return { data: null, error: { message: 'missing' } }
        return { data: options.rate !== 'limited', error: null }
      }
      if (options.table === 'missing') return { data: null, error: { message: 'missing' } }
      if (name === 'naver_app_put') {
        const state = String(args.p_state)
        if (rows.has(state)) return { data: false, error: null }
        rows.set(state, { token_hash: String(args.p_token_hash), kind: String(args.p_kind), expires_at: now() + 120_000 })
        return { data: true, error: null }
      }
      if (name === 'naver_app_take') {
        const row = rows.get(String(args.p_state))
        rows.delete(String(args.p_state))
        if (!row || row.expires_at <= now()) return { data: null, error: null }
        return { data: { token_hash: row.token_hash, kind: row.kind, expires_at: new Date(row.expires_at).toISOString() }, error: null }
      }
      throw new Error(`unexpected rpc ${name}`)
    },
    auth: {
      admin: {
        generateLink: async ({ email }: { email: string }) =>
          users.has(email) ? { data: { properties: { hashed_token: `ticket-for-${email.slice(0, 8)}` } } } : { data: null },
        createUser: async ({ email }: { email: string }) => {
          users.add(email)
          return { data: {}, error: null }
        },
      },
    },
  }
  return { admin: admin as never, rows, users, rateKeys }
}

// 가짜 네이버: 토큰 교환과 회원 정보. 받은 요청을 적어 둔다.
function fakeNaver(options: { token?: boolean; id?: string } = {}) {
  const calls: { url: string; body: string }[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? String(init.body) : '' })
    if (url.startsWith('https://nid.naver.com/oauth2.0/token')) {
      return Response.json(options.token === false ? { error: 'invalid_request' } : { access_token: 'naver-access' })
    }
    if (url.startsWith('https://openapi.naver.com/v1/nid/me')) {
      return Response.json({ resultcode: '00', response: { id: options.id ?? 'naver-user-1' } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
  return { fetcher, calls }
}

const callback = (query: string, ip = '203.0.113.7') => new Request(`${BASE}/callback?${query}`, { headers: { 'cf-connecting-ip': ip } })
const claim = (body: unknown, ip = '203.0.113.7') =>
  new Request(`${BASE}/claim`, { method: 'POST', headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

const ctx = (server: ReturnType<typeof fakeServer>, naver: ReturnType<typeof fakeNaver>, now?: () => number) => ({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  admin: server.admin,
  fetcher: naver.fetcher,
  now,
})

const appParams = (response: Response) => {
  const location = response.headers.get('Location') ?? ''
  assert.ok(location.startsWith('highpress://auth/callback?'), location)
  return new URL(location.replace('highpress://', 'https://app.invalid/')).searchParams
}

// ── 순수 함수 ──────────────────────────────────────────────────────────────

test('state 는 verifier 의 SHA-256 을 base64url 로 적은 43자다', async () => {
  assert.equal(await verifierMatches(VERIFIER, STATE), true)
  assert.equal(await verifierMatches(OTHER_VERIFIER, STATE), false)
  assert.equal(isHashState(STATE), true)
  assert.equal(isHashState(STATE.slice(1)), false)
  assert.equal(isHashState(`${STATE}x`), false)
  assert.equal(isHashState(STATE.replace('-', '+')), false)
})

test('경로는 마지막 칸으로 고른다', () => {
  assert.equal(routeOf('/naver-app/callback'), 'callback')
  assert.equal(routeOf('/functions/v1/naver-app/claim/'), 'claim')
  assert.equal(routeOf('/naver-app'), null)
  assert.equal(routeOf('/naver-app/callbackx'), null)
})

test('앱으로 돌아가는 주소에는 state 나 짧은 오류 코드만 싣는다', () => {
  assert.equal(appRedirect({ state: STATE }), `highpress://auth/callback?naver=1&state=${STATE}`)
  assert.equal(appRedirect({ error: 'cancelled' }), 'highpress://auth/callback?naver=1&error=cancelled')
  assert.equal(callbackErrorOf('access_denied'), 'cancelled')
  assert.equal(callbackErrorOf('server_error'), 'naver')
})

test('만료 판단', () => {
  const now = Date.parse('2026-10-25T00:00:00Z')
  assert.equal(stillValid('2026-10-25T00:00:01Z', now), true)
  assert.equal(stillValid('2026-10-25T00:00:00Z', now), false)
  assert.equal(stillValid('bad', now), false)
  assert.equal(stillValid(undefined, now), false)
})

test('naver-login 의 빈도 제한 키는 공통 모듈로 옮겨도 예전과 같다', async () => {
  // 예전 naver-login 의 계산을 그대로 옮겨 둔 것
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s3cret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('naver-login:198.51.100.4'))
  const old = `naver-login:${Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}`
  assert.equal(await rateKey('naver-login', '198.51.100.4', 's3cret'), old)
})

test('IP 는 위조할 수 없는 머리글부터 본다', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.invalid/', { headers })
  assert.equal(clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' })), '1.1.1.1')
  assert.equal(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 3.3.3.3' })), '3.3.3.3')
  assert.equal(clientIp(req({})), '')
})

// ── 콜백 (네이버 → 서버 → 앱) ────────────────────────────────────────────

test('콜백: 코드를 바꿔 로그인 표를 state 이름으로 두고, 앱에는 state 만 보낸다', async () => {
  const server = fakeServer()
  const naver = fakeNaver()
  const response = await handle(callback(`code=naver-code-1&state=${STATE}`), ctx(server, naver))
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const location = response.headers.get('Location') ?? ''
  assert.equal(location, `highpress://auth/callback?naver=1&state=${STATE}`)
  // 앱 주소에 코드 · 로그인 표 · 비밀값이 없다
  for (const secret of ['naver-code-1', 'ticket-for', 'client-secret', 'naver-access']) assert.ok(!location.includes(secret), secret)
  // 네이버에는 Secret 을 본문으로 보낸다 (주소에 싣지 않는다)
  const token = naver.calls.find((call) => call.url.startsWith('https://nid.naver.com/'))!
  assert.ok(!token.url.includes('client-secret'))
  assert.ok(new URLSearchParams(token.body).get('client_secret') === 'client-secret')
  assert.equal(new URLSearchParams(token.body).get('state'), STATE)
  // 처음 온 사람이라 계정이 만들어지고, 표가 하나 들어갔다
  assert.equal(server.users.size, 1)
  assert.match([...server.users][0], /^n[0-9a-f]{40}@naver\.high-press\.workers\.dev$/)
  assert.equal(server.rows.get(STATE)?.kind, 'email')
  assert.ok(server.rows.get(STATE)?.token_hash.startsWith('ticket-for-'))
  // 빈도 제한은 콜백 칸에서 IP 해시로 센다 (IP 가 키에 그대로 남지 않는다)
  assert.match(server.rateKeys[0], /^naver-app-callback:[0-9a-f]{32}$/)
})

test('콜백: 같은 state 가 이미 있으면 거절한다 (앞의 표는 그대로)', async () => {
  const server = fakeServer()
  const naver = fakeNaver()
  await handle(callback(`code=c1&state=${STATE}`), ctx(server, naver))
  const before = server.rows.get(STATE)?.token_hash
  const again = await handle(callback(`code=c2&state=${STATE}`), ctx(server, naver))
  assert.equal(appParams(again).get('error'), 'used')
  assert.equal(appParams(again).get('state'), null)
  assert.equal(server.rows.get(STATE)?.token_hash, before)
})

test('콜백: 취소 · 꼴이 틀린 값 · 네이버 거절 · 빈도 초과 · 설정 없음은 짧은 오류 코드로 앱에 돌려보낸다', async () => {
  const cases: [string, ReturnType<typeof fakeServer>, ReturnType<typeof fakeNaver>, string, boolean][] = [
    [`error=access_denied&error_description=Canceled+By+User&state=${STATE}`, fakeServer(), fakeNaver(), 'cancelled', false],
    [`error=server_error&state=${STATE}`, fakeServer(), fakeNaver(), 'naver', false],
    [`code=c1&state=short-state`, fakeServer(), fakeNaver(), 'bad-request', false],
    [`code=c1`, fakeServer(), fakeNaver(), 'bad-request', false],
    [`code=bad%20code&state=${STATE}`, fakeServer(), fakeNaver(), 'bad-request', false],
    [`code=c1&state=${STATE}`, fakeServer(), fakeNaver({ token: false }), 'naver', true],
    [`code=c1&state=${STATE}`, fakeServer(), fakeNaver({ id: 'bad id!' }), 'naver', true],
    [`code=c1&state=${STATE}`, fakeServer({ rate: 'limited' }), fakeNaver(), 'rate', false],
    [`code=c1&state=${STATE}`, fakeServer({ rate: 'off' }), fakeNaver(), 'off', false],
    [`code=c1&state=${STATE}`, fakeServer({ table: 'missing' }), fakeNaver(), 'off', true],
  ]
  for (const [query, server, naver, expected, askedNaver] of cases) {
    const response = await handle(callback(query), ctx(server, naver))
    assert.equal(response.status, 302, query)
    const params = appParams(response)
    assert.equal(params.get('naver'), '1')
    assert.equal(params.get('error'), expected, query)
    assert.equal(params.get('state'), null, query)
    assert.equal(naver.calls.length > 0, askedNaver, `${query} 네이버에 물었는지`)
    assert.equal(server.rows.size, 0, query)
  }
  const off = await handle(callback(`code=c1&state=${STATE}`), { clientId: '', clientSecret: '', admin: null })
  assert.equal(appParams(off).get('error'), 'off')
})

// ── 찾아가기 (앱 → 서버) ─────────────────────────────────────────────────

test('찾아가기: verifier 가 맞으면 한 번만 내주고, 다시 부르면 expired', async () => {
  const server = fakeServer()
  await handle(callback(`code=c1&state=${STATE}`), ctx(server, fakeNaver()))
  const first = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(server, fakeNaver()))
  assert.equal(first.status, 200)
  const body = (await first.json()) as { tokenHash: string; type: string }
  assert.ok(body.tokenHash.startsWith('ticket-for-'))
  assert.equal(body.type, 'email')
  assert.equal(server.rows.size, 0)
  const second = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(server, fakeNaver()))
  assert.equal(second.status, 404)
  assert.deepEqual(await second.json(), { error: 'expired' })
  assert.match(server.rateKeys.at(-1)!, /^naver-app-claim:[0-9a-f]{32}$/)
})

test('찾아가기: 틀린 verifier 는 400 bad-verifier 이고 표를 건드리지 않는다 (가로챈 state 만으로는 못 가져간다)', async () => {
  const server = fakeServer()
  await handle(callback(`code=c1&state=${STATE}`), ctx(server, fakeNaver()))
  for (const verifier of [OTHER_VERIFIER, 'short', STATE, 42]) {
    const response = await handle(claim({ state: STATE, verifier }), ctx(server, fakeNaver()))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'bad-verifier' })
  }
  assert.equal(server.rows.size, 1)
  // 그 뒤에도 진짜 앱은 가져간다
  const real = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(server, fakeNaver()))
  assert.equal(real.status, 200)
})

test('찾아가기: 2분이 지나면 404 expired', async () => {
  let clock = Date.parse('2026-10-25T00:00:00Z')
  const server = fakeServer({ now: () => clock })
  await handle(callback(`code=c1&state=${STATE}`), ctx(server, fakeNaver(), () => clock))
  clock += 120_000
  const late = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(server, fakeNaver(), () => clock))
  assert.equal(late.status, 404)
  assert.deepEqual(await late.json(), { error: 'expired' })
})

test('찾아가기: 꼴이 틀린 몸통 · 빈도 초과 · 설정 없음', async () => {
  const server = fakeServer()
  const bad = await handle(claim('not json'), ctx(server, fakeNaver()))
  assert.equal(bad.status, 400)
  assert.deepEqual(await bad.json(), { error: 'bad-request' })
  const noState = await handle(claim({ state: 'x', verifier: VERIFIER }), ctx(server, fakeNaver()))
  assert.deepEqual([noState.status, await noState.json()], [400, { error: 'bad-request' }])
  const limited = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(fakeServer({ rate: 'limited' }), fakeNaver()))
  assert.deepEqual([limited.status, await limited.json()], [429, { error: 'rate' }])
  const missing = await handle(claim({ state: STATE, verifier: VERIFIER }), ctx(fakeServer({ table: 'missing' }), fakeNaver()))
  assert.deepEqual([missing.status, await missing.json()], [503, { error: 'off' }])
  const off = await handle(claim({ state: STATE, verifier: VERIFIER }), { clientId: '', clientSecret: '', admin: null })
  assert.deepEqual([off.status, await off.json()], [503, { error: 'off' }])
})

test('그 밖의 방법 · 경로는 받지 않는다', async () => {
  const server = fakeServer()
  const getClaim = await handle(new Request(`${BASE}/claim`), ctx(server, fakeNaver()))
  assert.equal(getClaim.status, 405)
  const postCallback = await handle(new Request(`${BASE}/callback?code=c1&state=${STATE}`, { method: 'POST' }), ctx(server, fakeNaver()))
  assert.equal(postCallback.status, 405)
  const root = await handle(new Request(BASE), ctx(server, fakeNaver()))
  assert.equal(root.status, 404)
  assert.equal(server.rateKeys.length, 0)
})
