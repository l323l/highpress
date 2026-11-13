import { getServer } from '../../lib/supabase'

// 운영자용 사용량 (A-6). 서버 함수 admin_usage() 가 숫자만 돌려준다.
export interface Usage {
  users: number
  maxUsers: number
  drafts: number
  dbBytes: number
  dbLimitBytes: number
  edgeCallsMonth: number
  edgeMonthLimit: number
  pastApiToday: number
  statCallsToday: number
  cacheRows: number
}

// 무료 플랜 한도 (2026-10-09 공식 요금 페이지 기준). 한도가 바뀌면 여기와 app_config 를 함께 고친다.
export const FREE_LIMITS = { dbBytes: 500 * 1024 * 1024, edgeCallsMonth: 500_000, pastApiDay: 100 } as const
// 앱이 실제로 멈추는 지점 (서버 함수의 PAST_DAILY_BUDGET 와 같은 값)
export const PAST_API_STOP = 90

export type UsageError = 'not-admin' | 'failed'

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0)

export async function loadUsage(): Promise<Usage | UsageError> {
  const server = await getServer()
  if (!server) return 'failed'
  const { data, error } = await server.rpc('admin_usage')
  if (error) return error.message.includes('not_admin') ? 'not-admin' : 'failed'
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    users: num(raw.users),
    maxUsers: num(raw.max_users),
    drafts: num(raw.drafts),
    dbBytes: num(raw.db_bytes),
    dbLimitBytes: num(raw.db_limit_bytes),
    edgeCallsMonth: num(raw.edge_calls_month),
    edgeMonthLimit: num(raw.edge_month_limit),
    pastApiToday: num(raw.past_api_today),
    statCallsToday: num(raw.stat_calls_today),
    cacheRows: num(raw.cache_rows),
  }
}

// 하루 방문자와 그중 로그인한 사람. 서버 함수 admin_daily_active() (0012 · 0013) 가 날짜별 숫자만 돌려준다.
// 날짜는 한국 시간 기준 'YYYY-MM-DD', days 는 오늘부터 거슬러 올라간다.
export interface DailyActive {
  today: string
  // 처음 센 날. 그 앞은 세지 않은 날이라 숫자 대신 '-'를 보여 준다.
  since: string | null
  visitorsSince: string | null
  // 서버에 0013_daily_visitors.sql 을 넣었는가 (넣기 전에는 로그인한 사람만 센다)
  hasVisitors: boolean
  // 방문자를 웹 · 앱으로 나눠 센 값이 오는가 (0015_app_support.sql 뒤). 없으면 합계만 보여 준다.
  hasSources?: boolean
  // 웹 · 앱을 나눠 처음 센 날. 그 앞의 날은 나눔 칸이 "세지 않음"이다.
  sourcesSince?: string | null
  // 세지 않은 날의 칸은 null. web · app 은 방문자를 어디서 열었는지로 나눈 수다.
  days: { day: string; users: number | null; visitors: number | null; web?: number | null; app?: number | null }[]
}

// missing: 서버에 0012_daily_active.sql 을 아직 넣지 않았다.
export type DailyActiveError = UsageError | 'missing'

const OUTDATED = ['PGRST202', '42883']

export async function loadDailyActive(days = 14): Promise<DailyActive | DailyActiveError> {
  const server = await getServer()
  if (!server) return 'failed'
  const { data, error } = await server.rpc('admin_daily_active', { p_days: days })
  if (error) {
    if (error.message.includes('not_admin')) return 'not-admin'
    return OUTDATED.includes(error.code ?? '') ? 'missing' : 'failed'
  }
  const raw = (data ?? {}) as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const list = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : []
  const since = text(raw.since) || null
  const visitorsSince = text(raw.visitors_since) || null
  const counted = (day: string, from: string | null) => from !== null && day >= from
  // 웹 · 앱 나눔은 날짜별 항목에 web, app 이 실려 오면 쓴다. 그 앞의 날은 합계만 있다.
  const sourcesSince = text(raw.sources_since) || null
  const hasSources = sourcesSince !== null || list.some((row) => 'web' in row || 'app' in row)
  // 나눠 센 날부터만 숫자로 본다. 그 앞의 0 은 "세지 않음"이다.
  const sourceFrom = sourcesSince ?? visitorsSince
  const source = (row: Record<string, unknown>, key: 'web' | 'app', day: string) => (counted(day, sourceFrom) && counted(day, visitorsSince) && key in row ? num(row[key]) : null)
  return {
    today: text(raw.today),
    since,
    visitorsSince,
    hasVisitors: 'visitors_since' in raw,
    // 나눠 온 날이 있을 때만 붙인다 (예전 서버의 응답 모양은 그대로).
    ...(hasSources ? { hasSources, sourcesSince } : {}),
    // 둘 다 세기 전의 날은 뺀다.
    days: list
      .map((row) => {
        const day = text(row.day)
        const base = { day, users: counted(day, since) ? num(row.users) : null, visitors: counted(day, visitorsSince) ? num(row.visitors) : null }
        return hasSources ? { ...base, web: source(row, 'web', day), app: source(row, 'app', day) } : base
      })
      .filter((row) => row.day && (row.users !== null || row.visitors !== null)),
  }
}

export interface DailySummary {
  today: number | null
  yesterday: number | null
  // 최근 7일(오늘 포함) 중 센 날들의 평균. 센 날이 없으면 null.
  weekAverage: number | null
}

// key: 방문자(visitors) 또는 그중 로그인한 사람(users)
export function dailySummary(active: DailyActive, key: 'visitors' | 'users' = 'visitors'): DailySummary {
  // 서버가 오늘부터 하루씩 거슬러 주므로 첫째가 오늘, 둘째가 어제다.
  const value = (index: number) => active.days[index]?.[key] ?? null
  const week = active.days
    .slice(0, 7)
    .map((row) => row[key])
    .filter((n): n is number => n !== null)
  return { today: value(0), yesterday: value(1), weekAverage: week.length ? week.reduce((sum, n) => sum + n, 0) / week.length : null }
}

// 사용자 본인의 할당량 (A-4). 한도 값은 서버(0001_init.sql, functions/stats)와 같아야 한다.
export const DRAFT_LIMIT = 3
export const STAT_DAILY_LIMIT = 300

export interface Quota {
  drafts: number
  statCallsToday: number
}

// 본인 행만 읽힌다 (RLS). 읽지 못하면 null.
export async function loadQuota(): Promise<Quota | null> {
  const server = await getServer()
  if (!server) return null
  const today = new Date().toISOString().slice(0, 10)
  const [drafts, usage] = await Promise.all([
    server.from('drafts').select('id', { count: 'exact', head: true }),
    server.from('user_usage').select('stat_calls').eq('day', today).maybeSingle(),
  ])
  if (drafts.error || usage.error) return null
  return { drafts: drafts.count ?? 0, statCallsToday: num(usage.data?.stat_calls) }
}

export function quotaText(quota: Quota): string {
  return `서버 초안 ${quota.drafts}/${DRAFT_LIMIT}편 · 오늘 스탯 조회 ${quota.statCallsToday}/${STAT_DAILY_LIMIT}회`
}

export type Level = 'ok' | 'near' | 'limited'

export interface UsageRow {
  name: string
  // 지금 값, 제한이 걸리는 기준, 무료 한도 (화면 표기용 글자)
  current: string
  threshold: string
  limit: string
  level: Level
  // 기준에 닿으면 일어나는 일
  effect: string
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`
const count = (n: number) => n.toLocaleString('ko-KR')

// 기준의 80%를 넘으면 '임박', 기준에 닿으면 '제한 중'
export function levelOf(current: number, threshold: number): Level {
  if (threshold <= 0) return 'ok'
  if (current >= threshold) return 'limited'
  return current >= threshold * 0.8 ? 'near' : 'ok'
}

export function usageRows(usage: Usage): UsageRow[] {
  return [
    {
      name: '가입자',
      current: `${count(usage.users)}명`,
      threshold: `${count(usage.maxUsers)}명`,
      limit: '운영자 설정',
      level: levelOf(usage.users, usage.maxUsers),
      effect: '신규 가입 중단',
    },
    {
      name: 'DB 용량',
      current: mb(usage.dbBytes),
      threshold: mb(usage.dbLimitBytes),
      limit: mb(FREE_LIMITS.dbBytes),
      level: levelOf(usage.dbBytes, usage.dbLimitBytes),
      effect: '신규 가입과 새 초안 올리기 중단 (기기 저장은 계속)',
    },
    {
      name: '서버 함수 호출 (이번 달)',
      current: `${count(usage.edgeCallsMonth)}회`,
      threshold: `${count(usage.edgeMonthLimit)}회`,
      limit: `${count(FREE_LIMITS.edgeCallsMonth)}회`,
      level: levelOf(usage.edgeCallsMonth, usage.edgeMonthLimit),
      effect: '스탯을 캐시된 데이터로만 제공',
    },
    {
      name: 'API-Football 호출 (오늘)',
      current: `${count(usage.pastApiToday)}회`,
      threshold: `${PAST_API_STOP}회`,
      limit: `${FREE_LIMITS.pastApiDay}회`,
      level: levelOf(usage.pastApiToday, PAST_API_STOP),
      effect: '지난 시즌 스탯을 캐시된 데이터로만 제공',
    },
  ]
}

export const LEVEL_TEXT: Record<Level, string> = { ok: '여유', near: '임박', limited: '제한 중' }
