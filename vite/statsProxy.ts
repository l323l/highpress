import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { LEAGUES, PAST_SEASONS } from '../packages/core/src/stats/leagues.ts'

// 개발·미리보기 서버에서만 도는 스탯 프록시 (S-6, S-7, S-8의 로컬 판).
// API 키는 이 서버 프로세스에만 있고 브라우저 번들에 들어가지 않는다 (SEC-2).
// 배포 환경에서는 같은 경로를 Supabase Edge Function이 맡는다 (M6·M7).

export interface StatsProxyKeys {
  footballData?: string
  apiFootball?: string
}

const PREFIX = '/api/stats/'
const HOUR = 60 * 60 * 1000
// API-Football 무료 한도는 하루 100회. 여유를 두고 멈춘다.
const PAST_DAILY_BUDGET = 90
const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'stats-proxy')

interface Upstream {
  provider: 'current' | 'past'
  url: string
  // 0이면 만료 없음 (끝난 시즌은 바뀌지 않는다)
  ttlMs: number
}

const CODES = new Set(LEAGUES.map((league) => league.code))
const IDS = new Set(LEAGUES.map((league) => String(league.apiFootballId)))
const SEASONS = new Set(PAST_SEASONS.map(String))

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

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8')) as T
  } catch {
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, file), JSON.stringify(value))
}

const today = () => new Date().toISOString().slice(0, 10)

function pastUsedToday(): number {
  const budget = readJson<{ day: string; used: number }>('budget.json')
  return budget && budget.day === today() ? budget.used : 0
}

function hasErrors(body: unknown): boolean {
  const errors = (body as { errors?: unknown } | null)?.errors
  return Array.isArray(errors) ? errors.length > 0 : typeof errors === 'object' && errors !== null && Object.keys(errors).length > 0
}

function send(res: ServerResponse, status: number, body: unknown, cache = 'miss'): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Stats-Cache', cache)
  res.end(JSON.stringify(body))
}

async function handle(req: IncomingMessage, res: ServerResponse, keys: StatsProxyKeys): Promise<void> {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' })
  const url = new URL(req.url ?? '', 'http://localhost')
  const upstream = resolve(url.pathname.slice(PREFIX.length), url.searchParams)
  if (!upstream) return send(res, 400, { error: 'bad-request' })

  const cacheFile = `${createHash('sha256').update(upstream.url).digest('hex').slice(0, 32)}.json`
  const cached = readJson<{ savedAt: number; body: unknown }>(cacheFile)
  if (cached && (upstream.ttlMs === 0 || Date.now() - cached.savedAt < upstream.ttlMs)) return send(res, 200, cached.body, 'hit')

  const key = upstream.provider === 'current' ? keys.footballData : keys.apiFootball
  if (!key) return send(res, 503, { error: 'no-key' })
  if (upstream.provider === 'past') {
    const used = pastUsedToday()
    if (used >= PAST_DAILY_BUDGET) return send(res, 429, { error: 'budget' })
    writeJson('budget.json', { day: today(), used: used + 1 })
  }

  let response: Response
  try {
    response = await fetch(upstream.url, { headers: upstream.provider === 'current' ? { 'X-Auth-Token': key } : { 'x-apisports-key': key } })
  } catch {
    // 연결이 안 되면 오래된 캐시라도 준다.
    return cached ? send(res, 200, cached.body, 'stale') : send(res, 502, { error: 'upstream' })
  }
  if (response.status === 429) return cached ? send(res, 200, cached.body, 'stale') : send(res, 429, { error: 'rate' })
  if (!response.ok) return send(res, 502, { error: 'upstream', status: response.status })
  const body: unknown = await response.json().catch(() => null)
  if (body === null) return send(res, 502, { error: 'upstream' })
  // 오류가 담긴 응답(플랜 제한 등)은 캐시하지 않는다.
  if (!hasErrors(body)) writeJson(cacheFile, { savedAt: Date.now(), body })
  send(res, 200, body)
}

type Middlewares = { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }

export function statsProxy(keys: StatsProxyKeys): Plugin {
  // 값을 돌려주면 Vite가 그것을 나중에 부를 함수로 여기므로, 아무것도 돌려주지 않는다.
  const attach = (middlewares: Middlewares): void => {
    middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(PREFIX)) return next()
      handle(req, res, keys).catch(() => send(res, 500, { error: 'proxy' }))
    })
  }
  return {
    name: 'stats-proxy',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
