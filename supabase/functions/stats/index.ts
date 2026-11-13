// 배포용 스탯 서버 (S-6 ~ S-9). 개발 서버의 vite/statsProxy.ts와 같은 경로·같은 응답을 준다.
// 축구 API 키는 이 함수의 비밀값으로만 둔다: supabase secrets set FOOTBALL_DATA_TOKEN=... API_FOOTBALL_KEY=...
import { createClient } from 'jsr:@supabase/supabase-js@2'

// src/features/stats/leagues.ts 와 같은 값이어야 한다.
const CODES = new Set(['PL', 'PD', 'BL1', 'SA', 'FL1'])
const IDS = new Set(['39', '140', '78', '135', '61'])
const SEASONS = new Set(['2024', '2023', '2022'])

const HOUR = 60 * 60 * 1000
// API-Football 무료 한도는 하루 100회. 여유를 두고 멈춘다.
const PAST_DAILY_BUDGET = 90
// 한 사용자가 하루에 조회할 수 있는 횟수 (캐시된 응답 포함). 한 사람이 예산을 독점하지 못하게 한다 (S-9).
const USER_DAILY_LIMIT = 300
// 서버 함수 무료 한도는 한 달 50만 회. 80%에 닿으면 새로 가져오지 않고 캐시된 데이터만 준다 (SB-10).
const EDGE_MONTH_LIMIT = 400_000

interface Upstream {
  provider: 'current' | 'past'
  url: string
  // 0이면 만료 없음 (끝난 시즌은 바뀌지 않는다)
  ttlMs: number
}

// 정해 둔 경로와 값만 받는다. 그 밖의 요청은 바깥으로 나가지 않는다.
function resolve(route: string, query: URLSearchParams): Upstream | null {
  const fd = 'https://api.football-data.org/v4'
  const af = 'https://v3.football.api-sports.io'
  const league = query.get('league') ?? ''
  const season = query.get('season') ?? ''
  const id = query.get('id') ?? ''
  if (route.startsWith('current-')) {
    if (!CODES.has(league)) return null
    if (route === 'current-standings') return { provider: 'current', url: `${fd}/competitions/${league}/standings`, ttlMs: 6 * HOUR }
    if (route === 'current-scorers') return { provider: 'current', url: `${fd}/competitions/${league}/scorers?limit=20`, ttlMs: 6 * HOUR }
    if (route === 'current-results') return { provider: 'current', url: `${fd}/competitions/${league}/matches?status=FINISHED`, ttlMs: HOUR }
    return null
  }
  if (route === 'past-match') return /^\d{1,9}$/.test(id) ? { provider: 'past', url: `${af}/fixtures?id=${id}`, ttlMs: 0 } : null
  if (!IDS.has(league) || !SEASONS.has(season)) return null
  if (route === 'past-standings') return { provider: 'past', url: `${af}/standings?league=${league}&season=${season}`, ttlMs: 0 }
  if (route === 'past-scorers') return { provider: 'past', url: `${af}/players/topscorers?league=${league}&season=${season}`, ttlMs: 0 }
  if (route === 'past-matches') return { provider: 'past', url: `${af}/fixtures?league=${league}&season=${season}&status=FT`, ttlMs: 0 }
  return null
}

function hasErrors(body: unknown): boolean {
  const errors = (body as { errors?: unknown } | null)?.errors
  return Array.isArray(errors) ? errors.length > 0 : typeof errors === 'object' && errors !== null && Object.keys(errors).length > 0
}

// 앱이 올라간 주소만 허용한다. 여러 개면 쉼표로 구분: supabase secrets set APP_ORIGINS=https://example.pages.dev,http://localhost:5173
function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const send = (status: number, body: unknown, cache = 'miss') =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Stats-Cache': cache },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return send(405, { error: 'method' })

  const url = new URL(req.url)
  const upstream = resolve(url.pathname.split('/').pop() ?? '', url.searchParams)
  if (!upstream) return send(400, { error: 'bad-request' })

  // 로그인한 사용자만 쓴다 (SEC-3).
  const authorization = req.headers.get('Authorization') ?? ''
  const projectUrl = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(projectUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return send(401, { error: 'login' })

  const admin = createClient(projectUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: allowed } = await admin.rpc('bump_user_usage', { p_user: auth.user.id, p_limit: USER_DAILY_LIMIT })
  if (allowed !== true) return send(429, { error: 'user-limit' })

  // 0002_ops.sql 을 아직 넣지 않은 프로젝트에서는 이 함수가 없다. 그때는 제한 없이 지나간다.
  const month = await admin.rpc('bump_edge_month', { p_limit: EDGE_MONTH_LIMIT })
  const cacheOnly = !month.error && month.data !== true

  // 같은 데이터는 전체 사용자가 한 번의 호출분을 나눠 쓴다 (S-7).
  const key = `${url.pathname.split('/').pop()}?${[...url.searchParams].sort().map(([k, v]) => `${k}=${v}`).join('&')}`
  const { data: cached } = await admin.from('stat_cache').select('body, saved_at').eq('key', key).maybeSingle()
  if (cached && (upstream.ttlMs === 0 || Date.now() - new Date(cached.saved_at).getTime() < upstream.ttlMs)) return send(200, cached.body, 'hit')

  if (cacheOnly) return cached ? send(200, cached.body, 'stale') : send(429, { error: 'budget' })

  const secret = Deno.env.get(upstream.provider === 'current' ? 'FOOTBALL_DATA_TOKEN' : 'API_FOOTBALL_KEY')
  if (!secret) return send(503, { error: 'no-key' })

  // 예산이 떨어지면 캐시된 데이터만 준다 (S-8).
  if (upstream.provider === 'past') {
    const { data: inBudget } = await admin.rpc('bump_api_budget', { p_provider: 'api-football', p_limit: PAST_DAILY_BUDGET })
    if (inBudget !== true) return cached ? send(200, cached.body, 'stale') : send(429, { error: 'budget' })
  }

  let response: Response
  try {
    response = await fetch(upstream.url, { headers: upstream.provider === 'current' ? { 'X-Auth-Token': secret } : { 'x-apisports-key': secret } })
  } catch {
    return cached ? send(200, cached.body, 'stale') : send(502, { error: 'upstream' })
  }
  if (response.status === 429) return cached ? send(200, cached.body, 'stale') : send(429, { error: 'rate' })
  if (!response.ok) return send(502, { error: 'upstream' })
  const body: unknown = await response.json().catch(() => null)
  if (body === null) return send(502, { error: 'upstream' })
  // 오류가 담긴 응답(플랜 제한 등)은 캐시하지 않는다.
  if (!hasErrors(body)) await admin.from('stat_cache').upsert({ key, body, saved_at: new Date().toISOString() })
  return send(200, body)
})
