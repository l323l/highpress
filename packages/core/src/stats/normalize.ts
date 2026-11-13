import { seasonLabel } from './leagues'
import type { StatCell, StatSnapshot } from './types'

// 축구 API 응답을 도표 데이터로 바꾼다. 응답 형식이 예상과 다르면 예외를 던진다.

export const SOURCE_CURRENT = 'football-data.org'
export const SOURCE_PAST = 'API-Football'

export class EmptyStatError extends Error {
  constructor() {
    super('no rows')
  }
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) ? n : 0
}
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n))
const day = (iso: unknown): string => str(iso).slice(5, 10).replace('-', '.')

function finish(snapshot: Omit<StatSnapshot, 'fetchedAt'>, limit?: number): StatSnapshot {
  const rows = limit ? snapshot.rows.slice(0, limit) : snapshot.rows
  if (rows.length === 0) throw new EmptyStatError()
  return { ...snapshot, rows, fetchedAt: Date.now() }
}

const STANDING_COLUMNS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점']

// ── football-data.org (현재 시즌) ──────────────────────────────────────────

function currentSubtitle(body: Json): string {
  const season = obj(body.season)
  const start = Number.parseInt(str(season.startDate).slice(0, 4), 10)
  const matchday = num(season.currentMatchday)
  return [Number.isFinite(start) ? `${seasonLabel(start)} 시즌` : '', matchday ? `${matchday}라운드` : ''].filter(Boolean).join(' · ')
}

export function currentStandings(raw: unknown, leagueName: string, limit?: number): StatSnapshot {
  const body = obj(raw)
  const total = list(body.standings).map(obj).find((s) => s.type === 'TOTAL') ?? obj(list(body.standings)[0])
  const rows = list(total.table).map((entry): StatCell[] => {
    const row = obj(entry)
    const team = obj(row.team)
    return [num(row.position), str(team.shortName) || str(team.name), num(row.playedGames), num(row.won), num(row.draw), num(row.lost), signed(num(row.goalDifference)), num(row.points)]
  })
  return finish({ view: 'table', title: `${leagueName} 순위표`, subtitle: currentSubtitle(body), source: SOURCE_CURRENT, columns: STANDING_COLUMNS, rows }, limit)
}

export function currentScorers(raw: unknown, leagueName: string, limit?: number): StatSnapshot {
  const body = obj(raw)
  const rows = list(body.scorers).map((entry): StatCell[] => {
    const row = obj(entry)
    return [str(obj(row.player).name), str(obj(row.team).shortName) || str(obj(row.team).name), num(row.goals)]
  })
  return finish({ view: 'bars', title: `${leagueName} 득점 순위`, subtitle: currentSubtitle(body), source: SOURCE_CURRENT, columns: ['선수', '팀', '골'], rows }, limit)
}

export function currentResults(raw: unknown, leagueName: string, limit = 10): StatSnapshot {
  const body = obj(raw)
  const rows = list(body.matches)
    .map(obj)
    .sort((a, b) => str(b.utcDate).localeCompare(str(a.utcDate)))
    .map((match): StatCell[] => {
      const score = obj(obj(match.score).fullTime)
      const name = (team: unknown) => str(obj(team).shortName) || str(obj(team).name)
      return [day(match.utcDate), name(match.homeTeam), `${num(score.home)} - ${num(score.away)}`, name(match.awayTeam)]
    })
  return finish({ view: 'table', title: `${leagueName} 최근 경기 결과`, subtitle: `최근 ${Math.min(limit, rows.length)}경기`, source: SOURCE_CURRENT, columns: ['날짜', '홈', '결과', '원정'], rows }, limit)
}

// ── API-Football (지난 시즌) ───────────────────────────────────────────────

// 무료 플랜이 막은 시즌 등은 200 응답의 errors에 담겨 온다.
export function apiFootballError(raw: unknown): string | null {
  const errors = obj(raw).errors
  if (Array.isArray(errors)) return errors.length > 0 ? errors.map(str).join(' ') : null
  const values = Object.values(obj(errors)).map(str)
  return values.length > 0 ? values.join(' ') : null
}

const response = (raw: unknown): unknown[] => list(obj(raw).response)

export function pastStandings(raw: unknown, leagueName: string, season: number, limit?: number): StatSnapshot {
  const table = list(list(obj(obj(response(raw)[0]).league).standings)[0])
  const rows = table.map((entry): StatCell[] => {
    const row = obj(entry)
    const all = obj(row.all)
    return [num(row.rank), str(obj(row.team).name), num(all.played), num(all.win), num(all.draw), num(all.lose), signed(num(row.goalsDiff)), num(row.points)]
  })
  return finish({ view: 'table', title: `${leagueName} 순위표`, subtitle: `${seasonLabel(season)} 시즌 최종`, source: SOURCE_PAST, columns: STANDING_COLUMNS, rows }, limit)
}

export function pastScorers(raw: unknown, leagueName: string, season: number, limit?: number): StatSnapshot {
  const rows = response(raw).map((entry): StatCell[] => {
    const row = obj(entry)
    const stats = obj(list(row.statistics)[0])
    return [str(obj(row.player).name), str(obj(stats.team).name), num(obj(stats.goals).total)]
  })
  return finish({ view: 'bars', title: `${leagueName} 득점 순위`, subtitle: `${seasonLabel(season)} 시즌 최종`, source: SOURCE_PAST, columns: ['선수', '팀', '골'], rows }, limit)
}

export interface MatchOption {
  id: number
  round: string
  label: string
}

// "Regular Season - 12" → "12라운드"
function roundLabel(round: unknown): string {
  const text = str(round)
  const regular = /^Regular Season - (\d+)$/.exec(text)
  return regular ? `${regular[1]}라운드` : text
}

export function pastMatches(raw: unknown): MatchOption[] {
  return response(raw)
    .map(obj)
    .sort((a, b) => str(obj(a.fixture).date).localeCompare(str(obj(b.fixture).date)))
    .map((entry) => {
      const fixture = obj(entry.fixture)
      const teams = obj(entry.teams)
      const goals = obj(entry.goals)
      return {
        id: num(fixture.id),
        round: roundLabel(obj(entry.league).round),
        label: `${day(fixture.date)} ${str(obj(teams.home).name)} ${num(goals.home)}-${num(goals.away)} ${str(obj(teams.away).name)}`,
      }
    })
    .filter((match) => match.id > 0)
}

// 경기 스탯 비교에 싣는 항목. 응답에 없는 항목은 건너뛴다.
const MATCH_STATS: [type: string, label: string][] = [
  ['Ball Possession', '점유율 (%)'],
  ['expected_goals', '기대 득점 (xG)'],
  ['Total Shots', '슈팅'],
  ['Shots on Goal', '유효 슈팅'],
  ['Corner Kicks', '코너킥'],
  ['Passes %', '패스 성공률 (%)'],
  ['Fouls', '파울'],
  ['Yellow Cards', '경고'],
]

export function pastMatchStats(raw: unknown, leagueName: string): StatSnapshot {
  const entry = obj(response(raw)[0])
  const fixture = obj(entry.fixture)
  const league = obj(entry.league)
  const goals = obj(entry.goals)
  const sides = list(entry.statistics).map(obj)
  if (sides.length < 2) throw new EmptyStatError()
  const valueOf = (side: Json, type: string): number | null => {
    const found = list(side.statistics).map(obj).find((s) => s.type === type)
    return found && found.value !== null && found.value !== undefined ? num(found.value) : null
  }
  const rows: StatCell[][] = []
  for (const [type, label] of MATCH_STATS) {
    const home = valueOf(sides[0], type)
    const away = valueOf(sides[1], type)
    if (home !== null && away !== null) rows.push([label, home, away])
  }
  const home = str(obj(sides[0].team).name)
  const away = str(obj(sides[1].team).name)
  const season = num(league.season)
  return finish({
    view: 'versus',
    title: `${home} ${num(goals.home)} - ${num(goals.away)} ${away}`,
    subtitle: [leagueName, season ? seasonLabel(season) : '', roundLabel(league.round), str(fixture.date).slice(0, 10).replaceAll('-', '.')].filter(Boolean).join(' · '),
    source: SOURCE_PAST,
    columns: ['항목', '홈', '원정'],
    rows,
    teams: [home, away],
  })
}
