// 지원 리그. code는 football-data.org(현재 시즌), apiFootballId는 API-Football(지난 시즌) 식별자다.
// 개발 프록시(vite/statsProxy.ts)도 이 목록에 있는 값만 받는다.
export interface League {
  code: string
  apiFootballId: number
  name: string
}

export const LEAGUES: League[] = [
  { code: 'PL', apiFootballId: 39, name: '프리미어리그' },
  { code: 'PD', apiFootballId: 140, name: '라리가' },
  { code: 'BL1', apiFootballId: 78, name: '분데스리가' },
  { code: 'SA', apiFootballId: 135, name: '세리에 A' },
  { code: 'FL1', apiFootballId: 61, name: '리그 1' },
]

// API-Football 무료 플랜이 열어 주는 시즌 (2026-10-09 실제 키로 확인). 값은 시즌이 시작한 해.
export const PAST_SEASONS = [2024, 2023, 2022] as const

export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function leagueByCode(code: string): League | undefined {
  return LEAGUES.find((league) => league.code === code)
}
