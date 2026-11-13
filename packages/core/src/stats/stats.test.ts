import { describe, expect, it } from 'vitest'
import { seasonLabel } from './leagues'
import { apiFootballError, currentResults, currentScorers, currentStandings, EmptyStatError, pastMatches, pastMatchStats, pastScorers, pastStandings } from './normalize'
import { sitesFor, STAT_SITES } from './sites'
import { parseSnapshot, sourceLine, STAT_LIMITS, tableOf, type StatSnapshot } from './types'

const table: StatSnapshot = {
  view: 'table',
  title: '프리미어리그 순위표',
  subtitle: '2026-27 시즌',
  source: 'football-data.org',
  fetchedAt: Date.UTC(2026, 9, 9, 3),
  columns: ['순위', '팀', '승점'],
  rows: [
    [1, '팀 A', 15],
    [2, '팀 B', 12],
  ],
}

describe('스냅샷 검증', () => {
  it('올바른 스냅샷은 그대로 통과한다', () => {
    expect(parseSnapshot(table)).toEqual(table)
  })

  it('모양이 다르면 받지 않는다', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot({ ...table, view: 'pie' })).toBeNull()
    expect(parseSnapshot({ ...table, rows: 'x' })).toBeNull()
    expect(parseSnapshot({ ...table, rows: [] })).toBeNull()
    expect(parseSnapshot({ ...table, columns: [] })).toBeNull()
  })

  it('두 팀 비교는 팀 이름이 있어야 한다', () => {
    const versus = { ...table, view: 'versus', columns: ['항목', '홈', '원정'], rows: [['슈팅', 14, 10]] }
    expect(parseSnapshot(versus)).toBeNull()
    expect(parseSnapshot({ ...versus, teams: ['홈팀', '원정팀'] })?.teams).toEqual(['홈팀', '원정팀'])
  })

  it('행·열·글자 수를 한도에 맞추고, 글자·숫자가 아닌 값은 비운다', () => {
    const parsed = parseSnapshot({
      ...table,
      title: 'x'.repeat(200),
      columns: Array.from({ length: 20 }, (_, i) => `c${i}`),
      rows: Array.from({ length: 100 }, () => [{ evil: true }, Number.NaN, '<script>']),
    })!
    expect(parsed.title).toHaveLength(STAT_LIMITS.maxText)
    expect(parsed.columns).toHaveLength(STAT_LIMITS.maxColumns)
    expect(parsed.rows).toHaveLength(STAT_LIMITS.maxRows)
    expect(parsed.rows[0]).toHaveLength(STAT_LIMITS.maxColumns)
    expect(parsed.rows[0].slice(0, 3)).toEqual(['', 0, '<script>'])
  })

  it('출처와 조회일을 한 줄로 적는다', () => {
    expect(sourceLine({ source: 'API-Football', fetchedAt: new Date(2026, 9, 9).getTime() })).toBe('출처: API-Football · 2026.10.09 기준')
    expect(sourceLine({ source: 'API-Football', fetchedAt: 0 })).toBe('출처: API-Football')
  })

  it('어떤 도표든 표로 풀어 쓸 수 있다 (복사·내보내기용)', () => {
    expect(tableOf(table).head).toEqual(['순위', '팀', '승점'])
    const versus: StatSnapshot = { ...table, view: 'versus', columns: ['항목', '홈', '원정'], rows: [['슈팅', 14, 10]], teams: ['홈팀', '원정팀'] }
    expect(tableOf(versus)).toEqual({ head: ['홈팀', '', '원정팀'], body: [[14, '슈팅', 10]] })
  })
})

describe('football-data.org 응답 (이번 시즌)', () => {
  const season = { startDate: '2026-08-21', currentMatchday: 6 }

  it('순위표', () => {
    const raw = {
      season,
      standings: [
        { type: 'HOME', table: [] },
        {
          type: 'TOTAL',
          table: [
            { position: 1, team: { name: 'Manchester City FC', shortName: 'Man City' }, playedGames: 5, won: 5, draw: 0, lost: 0, goalDifference: 8, points: 15 },
            { position: 2, team: { name: 'Fulham FC' }, playedGames: 5, won: 0, draw: 2, lost: 3, goalDifference: -3, points: 2 },
          ],
        },
      ],
    }
    const snapshot = currentStandings(raw, '프리미어리그')
    expect(snapshot).toMatchObject({ view: 'table', title: '프리미어리그 순위표', subtitle: '2026-27 시즌 · 6라운드', source: 'football-data.org' })
    expect(snapshot.rows).toEqual([
      [1, 'Man City', 5, 5, 0, 0, '+8', 15],
      [2, 'Fulham FC', 5, 0, 2, 3, '-3', 2],
    ])
    expect(currentStandings(raw, '프리미어리그', 1).rows).toHaveLength(1)
  })

  it('득점 순위는 막대 도표로', () => {
    const raw = { season, scorers: [{ player: { name: 'Erling Haaland' }, team: { shortName: 'Man City' }, goals: 5 }] }
    expect(currentScorers(raw, '프리미어리그')).toMatchObject({ view: 'bars', columns: ['선수', '팀', '골'], rows: [['Erling Haaland', 'Man City', 5]] })
  })

  it('최근 경기 결과는 최신순으로', () => {
    const match = (utcDate: string, home: string, h: number, a: number, away: string) => ({ utcDate, homeTeam: { shortName: home }, awayTeam: { shortName: away }, score: { fullTime: { home: h, away: a } } })
    const raw = { matches: [match('2026-09-13T14:00:00Z', 'A', 1, 0, 'B'), match('2026-09-20T15:30:00Z', 'Fulham', 1, 1, 'Man United')] }
    const snapshot = currentResults(raw, '프리미어리그')
    expect(snapshot.rows[0]).toEqual(['09.20', 'Fulham', '1 - 1', 'Man United'])
    expect(snapshot.subtitle).toBe('최근 2경기')
  })

  it('내용이 비어 있으면 도표를 만들지 않는다', () => {
    expect(() => currentStandings({ standings: [] }, '프리미어리그')).toThrow(EmptyStatError)
    expect(() => currentScorers('엉뚱한 응답', '프리미어리그')).toThrow(EmptyStatError)
  })
})

describe('API-Football 응답 (지난 시즌)', () => {
  it('플랜 제한은 errors에 담겨 온다', () => {
    expect(apiFootballError({ errors: [] })).toBeNull()
    expect(apiFootballError({ errors: { plan: 'Free plans do not have access to this season' } })).toContain('Free plans')
  })

  it('순위표와 득점 순위', () => {
    const standings = { response: [{ league: { standings: [[{ rank: 1, team: { name: 'Liverpool' }, all: { played: 38, win: 25, draw: 9, lose: 4 }, goalsDiff: 45, points: 84 }]] } }] }
    expect(pastStandings(standings, '프리미어리그', 2024)).toMatchObject({ subtitle: '2024-25 시즌 최종', source: 'API-Football', rows: [[1, 'Liverpool', 38, 25, 9, 4, '+45', 84]] })
    const scorers = { response: [{ player: { name: 'Mohamed Salah' }, statistics: [{ team: { name: 'Liverpool' }, goals: { total: 29 } }] }] }
    expect(pastScorers(scorers, '프리미어리그', 2024).rows).toEqual([['Mohamed Salah', 'Liverpool', 29]])
  })

  it('경기 목록은 날짜순이고 라운드 이름을 우리말로 바꾼다', () => {
    const fixture = (id: number, date: string, round: string) => ({ fixture: { id, date }, league: { round }, teams: { home: { name: 'A' }, away: { name: 'B' } }, goals: { home: 2, away: 1 } })
    const options = pastMatches({ response: [fixture(2, '2024-08-24T14:00:00+00:00', 'Regular Season - 2'), fixture(1, '2024-08-16T19:00:00+00:00', 'Regular Season - 1')] })
    expect(options).toEqual([
      { id: 1, round: '1라운드', label: '08.16 A 2-1 B' },
      { id: 2, round: '2라운드', label: '08.24 A 2-1 B' },
    ])
  })

  it('경기 스탯 비교: 있는 항목만 싣고 %·문자 숫자를 숫자로 바꾼다', () => {
    const side = (name: string, stats: [string, unknown][]) => ({ team: { name }, statistics: stats.map(([type, value]) => ({ type, value })) })
    const raw = {
      response: [
        {
          fixture: { date: '2024-08-16T19:00:00+00:00' },
          league: { season: 2024, round: 'Regular Season - 1' },
          goals: { home: 1, away: 0 },
          statistics: [
            side('Manchester United', [['Ball Possession', '55%'], ['expected_goals', '2.43'], ['Total Shots', 14], ['Red Cards', null]]),
            side('Fulham', [['Ball Possession', '45%'], ['expected_goals', '0.44'], ['Total Shots', 10], ['Red Cards', null]]),
          ],
        },
      ],
    }
    const snapshot = pastMatchStats(raw, '프리미어리그')
    expect(snapshot).toMatchObject({ view: 'versus', title: 'Manchester United 1 - 0 Fulham', subtitle: '프리미어리그 · 2024-25 · 1라운드 · 2024.08.16', teams: ['Manchester United', 'Fulham'] })
    expect(snapshot.rows).toEqual([
      ['점유율 (%)', 55, 45],
      ['기대 득점 (xG)', 2.43, 0.44],
      ['슈팅', 14, 10],
    ])
  })

  it('스탯이 없는 경기는 도표를 만들지 않는다', () => {
    expect(() => pastMatchStats({ response: [{ statistics: [] }] }, '프리미어리그')).toThrow(EmptyStatError)
  })
})

describe('그 밖에', () => {
  it('시즌 표기', () => {
    expect(seasonLabel(2024)).toBe('2024-25')
    expect(seasonLabel(1999)).toBe('1999-00')
  })

  it('추천 사이트는 모두 https 주소이고, 찾는 스탯으로 추릴 수 있다', () => {
    for (const site of STAT_SITES) expect(new URL(site.url).protocol).toBe('https:')
    expect(sitesFor(null)).toHaveLength(STAT_SITES.length)
    expect(sitesFor('market').map((site) => site.name)).toEqual(['Transfermarkt'])
    expect(sitesFor('xg').map((site) => site.name)).toContain('Understat')
  })
})
