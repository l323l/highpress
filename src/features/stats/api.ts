import { SERVER_ANON_KEY, SERVER_URL, serverConfigured } from '../../lib/supabase'
import { accessToken } from '../account'
import {
  leagueByCode,
  apiFootballError,
  currentResults,
  currentScorers,
  currentStandings,
  EmptyStatError,
  pastMatches,
  pastMatchStats,
  pastScorers,
  pastStandings,
  type MatchOption,
} from '@highpress/core/stats'
import type { StatSnapshot } from '@highpress/core/stats'

// 스탯은 프록시로만 조회한다. 앱이 축구 API를 직접 부르지 않는다 (S-6).
// 개발 서버에서는 같은 출처의 /api/stats, 배포판에서는 로그인한 사용자만 쓰는 서버 함수가 맡는다.

export type StatsErrorCode = 'unavailable' | 'login' | 'user-limit' | 'no-key' | 'budget' | 'rate' | 'plan' | 'empty' | 'upstream'

export const STATS_ERROR_TEXT: Record<StatsErrorCode, string> = {
  unavailable: '스탯 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
  login: '스탯은 로그인한 뒤에 조회할 수 있습니다. 홈 화면에서 로그인해 주세요.',
  'user-limit': '오늘 조회할 수 있는 횟수를 다 썼습니다. 내일 다시 시도해 주세요.',
  'no-key': '스탯 API 키가 설정되지 않았습니다 (.env.local).',
  budget: '오늘 쓸 수 있는 지난 시즌 조회 횟수를 다 썼습니다. 내일 다시 시도해 주세요.',
  rate: '조회가 너무 잦습니다. 1분쯤 뒤에 다시 시도해 주세요.',
  plan: '이 데이터는 무료 플랜에서 제공되지 않습니다.',
  empty: '표시할 데이터가 없습니다.',
  upstream: '스탯을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export class StatsError extends Error {
  readonly code: StatsErrorCode

  constructor(code: StatsErrorCode) {
    super(STATS_ERROR_TEXT[code])
    this.code = code
  }
}

const SERVER_CODES: StatsErrorCode[] = ['login', 'user-limit', 'no-key', 'budget', 'rate']

async function get(route: string, params: Record<string, string | number>): Promise<unknown> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  let url = `/api/stats/${route}?${query}`
  let init: RequestInit | undefined
  if (!import.meta.env.DEV && serverConfigured) {
    const token = accessToken()
    if (!token) throw new StatsError('login')
    url = `${SERVER_URL}/functions/v1/stats/${route}?${query}`
    init = { headers: { Authorization: `Bearer ${token}`, apikey: SERVER_ANON_KEY } }
  }
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new StatsError('unavailable')
  }
  // 프록시가 없는 정적 호스팅에서는 HTML(앱 첫 화면)이 돌아온다.
  if (!response.headers.get('content-type')?.includes('application/json')) throw new StatsError('unavailable')
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = SERVER_CODES.find((c) => c === (body as { error?: unknown } | null)?.error)
    throw new StatsError(code ?? 'upstream')
  }
  return body
}

// 응답 형식이 달라 도표를 만들지 못한 경우도 "데이터 없음"으로 알린다.
function build(make: () => StatSnapshot): StatSnapshot {
  try {
    return make()
  } catch (error) {
    throw error instanceof EmptyStatError ? new StatsError('empty') : new StatsError('upstream')
  }
}

function league(code: string) {
  const found = leagueByCode(code)
  if (!found) throw new StatsError('upstream')
  return found
}

function checkPlan(raw: unknown): void {
  if (apiFootballError(raw)) throw new StatsError('plan')
}

export type CurrentKind = 'standings' | 'scorers' | 'results'
export type PastKind = 'standings' | 'scorers' | 'match'

export async function loadCurrent(kind: CurrentKind, code: string, limit?: number): Promise<StatSnapshot> {
  const { name } = league(code)
  const raw = await get(`current-${kind}`, { league: code })
  return build(() => (kind === 'standings' ? currentStandings(raw, name, limit) : kind === 'scorers' ? currentScorers(raw, name, limit) : currentResults(raw, name, limit)))
}

export async function loadPast(kind: 'standings' | 'scorers', code: string, season: number, limit?: number): Promise<StatSnapshot> {
  const { name, apiFootballId } = league(code)
  const raw = await get(`past-${kind}`, { league: apiFootballId, season })
  checkPlan(raw)
  return build(() => (kind === 'standings' ? pastStandings(raw, name, season, limit) : pastScorers(raw, name, season, limit)))
}

export async function loadPastMatches(code: string, season: number): Promise<MatchOption[]> {
  const raw = await get('past-matches', { league: league(code).apiFootballId, season })
  checkPlan(raw)
  return pastMatches(raw)
}

export async function loadPastMatch(code: string, fixtureId: number): Promise<StatSnapshot> {
  const { name } = league(code)
  const raw = await get('past-match', { id: fixtureId })
  checkPlan(raw)
  return build(() => pastMatchStats(raw, name))
}
