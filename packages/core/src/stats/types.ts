// 본문에 넣는 스탯 도표. 넣는 시점의 값을 그대로 담아 두고(S-5), 다시 조회하지 않는다.

export type StatView = 'table' | 'bars' | 'versus'

export type StatCell = string | number

export interface StatSnapshot {
  view: StatView
  title: string
  subtitle: string
  // 데이터 출처 표기 (S-11)
  source: string
  fetchedAt: number
  // table: 머리글과 행. bars: [이름, 소속, 값]. versus: [항목, 홈, 원정] (teams에 두 팀 이름).
  columns: string[]
  rows: StatCell[][]
  teams?: [string, string]
}

export const STAT_LIMITS = { maxRows: 40, maxColumns: 10, maxText: 60 } as const

const VIEWS: StatView[] = ['table', 'bars', 'versus']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, STAT_LIMITS.maxText) : '')

function cell(v: unknown): StatCell {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  return text(v)
}

// 저장된 본문·붙여넣기·백업에서 온 값을 믿지 않고 형식과 크기를 맞춘다. 쓸 수 없으면 null.
export function parseSnapshot(value: unknown): StatSnapshot | null {
  if (!isRecord(value)) return null
  const view = VIEWS.find((v) => v === value.view)
  if (!view || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null
  const columns = value.columns.slice(0, STAT_LIMITS.maxColumns).map(text)
  const width = view === 'table' ? columns.length : 3
  if (width === 0) return null
  const rows = value.rows
    .filter(Array.isArray)
    .slice(0, STAT_LIMITS.maxRows)
    .map((row) => Array.from({ length: width }, (_, i) => cell(row[i])))
  if (rows.length === 0) return null
  const teams = Array.isArray(value.teams) && value.teams.length === 2 ? ([text(value.teams[0]), text(value.teams[1])] as [string, string]) : undefined
  if (view === 'versus' && !teams) return null
  return {
    view,
    title: text(value.title),
    subtitle: text(value.subtitle),
    source: text(value.source),
    fetchedAt: typeof value.fetchedAt === 'number' && Number.isFinite(value.fetchedAt) ? value.fetchedAt : 0,
    columns,
    rows,
    ...(teams ? { teams } : {}),
  }
}

export function formatFetchedAt(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 도표 아래에 붙는 한 줄: 출처와 조회일
export function sourceLine(snapshot: Pick<StatSnapshot, 'source' | 'fetchedAt'>): string {
  const date = formatFetchedAt(snapshot.fetchedAt)
  return `출처: ${snapshot.source}${date ? ` · ${date} 기준` : ''}`
}

// 본문 HTML(복사·네이버 내보내기)에 싣는 표. 어떤 모양의 도표든 표로 풀어 쓴다.
export function tableOf(snapshot: StatSnapshot): { head: string[]; body: StatCell[][] } {
  if (snapshot.view === 'versus') return { head: [snapshot.teams![0], '', snapshot.teams![1]], body: snapshot.rows.map(([label, home, away]) => [home, label, away]) }
  if (snapshot.view === 'bars') return { head: snapshot.columns.slice(0, 3), body: snapshot.rows }
  return { head: snapshot.columns, body: snapshot.rows }
}
