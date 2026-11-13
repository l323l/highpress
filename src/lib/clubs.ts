// 피드에서 고를 수 있는 대표 구단. 공식 엠블럼은 쓰지 않고 구단 색과 약어로만 표시한다.
// id 는 서버(posts.club, profiles.club)에 그대로 저장되므로 바꾸지 않는다.

export interface Club {
  id: string
  name: string
  // 아이콘 아래에 적는 짧은 이름
  short: string
  abbr: string
  league: string
  // 원의 바탕색, 글자색, 안쪽 고리 색
  fill: string
  ink: string
  trim: string
}

export const CLUBS: readonly Club[] = [
  { id: 'ars', name: '아스널', short: '아스널', abbr: 'ARS', league: '프리미어리그', fill: '#e20613', ink: '#ffffff', trim: '#ffffff' },
  { id: 'mci', name: '맨체스터 시티', short: '맨시티', abbr: 'MCI', league: '프리미어리그', fill: '#6cabdd', ink: '#10244b', trim: '#1c2c5b' },
  { id: 'liv', name: '리버풀', short: '리버풀', abbr: 'LIV', league: '프리미어리그', fill: '#c8102e', ink: '#ffffff', trim: '#00b2a9' },
  { id: 'mun', name: '맨체스터 유나이티드', short: '맨유', abbr: 'MUN', league: '프리미어리그', fill: '#da291c', ink: '#ffffff', trim: '#fbe122' },
  { id: 'che', name: '첼시', short: '첼시', abbr: 'CHE', league: '프리미어리그', fill: '#034694', ink: '#ffffff', trim: '#dba111' },
  { id: 'tot', name: '토트넘', short: '토트넘', abbr: 'TOT', league: '프리미어리그', fill: '#132257', ink: '#ffffff', trim: '#ffffff' },
  { id: 'rma', name: '레알 마드리드', short: '레알', abbr: 'RMA', league: '라리가', fill: '#fdfdfb', ink: '#00428a', trim: '#febe10' },
  { id: 'bar', name: '바르셀로나', short: '바르사', abbr: 'BAR', league: '라리가', fill: '#a50044', ink: '#ffffff', trim: '#004d98' },
  { id: 'atm', name: '아틀레티코 마드리드', short: '아틀레티코', abbr: 'ATM', league: '라리가', fill: '#cb3524', ink: '#ffffff', trim: '#272e61' },
  { id: 'bay', name: '바이에른 뮌헨', short: '바이에른', abbr: 'BAY', league: '분데스리가', fill: '#dc052d', ink: '#ffffff', trim: '#0066b2' },
  { id: 'bvb', name: '도르트문트', short: '도르트문트', abbr: 'BVB', league: '분데스리가', fill: '#fde100', ink: '#111113', trim: '#111113' },
  { id: 'b04', name: '레버쿠젠', short: '레버쿠젠', abbr: 'B04', league: '분데스리가', fill: '#e32221', ink: '#ffffff', trim: '#111113' },
  { id: 'int', name: '인테르', short: '인테르', abbr: 'INT', league: '세리에 A', fill: '#0068a8', ink: '#ffffff', trim: '#111113' },
  { id: 'mil', name: 'AC 밀란', short: '밀란', abbr: 'MIL', league: '세리에 A', fill: '#fb090b', ink: '#ffffff', trim: '#111113' },
  { id: 'juv', name: '유벤투스', short: '유벤투스', abbr: 'JUV', league: '세리에 A', fill: '#111113', ink: '#ffffff', trim: '#ffffff' },
  { id: 'psg', name: '파리 생제르맹', short: 'PSG', abbr: 'PSG', league: '리그 1', fill: '#004170', ink: '#ffffff', trim: '#da291c' },
]

export const LEAGUES: readonly string[] = [...new Set(CLUBS.map((club) => club.league))]

// 리그 이름 앞에 그리는 국기의 나라.
export type LeagueCountry = 'eng' | 'esp' | 'ger' | 'ita' | 'fra'

export const LEAGUE_COUNTRY: Record<string, LeagueCountry> = {
  프리미어리그: 'eng',
  라리가: 'esp',
  분데스리가: 'ger',
  '세리에 A': 'ita',
  '리그 1': 'fra',
}

// 그 리그에 속한 구단들. 목록에 없는 리그면 빈 배열.
export function clubsIn(league: string | null): Club[] {
  return league ? CLUBS.filter((club) => club.league === league) : []
}

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]))

// 목록에 없는 값(서버에서 온 낯선 값 포함)은 구단 없음으로 본다.
export function clubOf(id: unknown): Club | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null
}

// 밝기(0 ~ 1). 아주 어두운 색은 어두운 화면에서 빛으로 쓸 수 없어 가려내는 데 쓴다.
function brightness(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255
}

// 홈에서 구단을 골랐을 때 배경에 번지는 두 색: 바탕색과 테두리색. 검정에 가까운 색은 다른 색으로 바꾼다.
export function clubTheme(club: Club): { a: string; b: string } {
  const dark = (hex: string) => brightness(hex) < 0.12
  const a = dark(club.fill) ? (dark(club.trim) ? '#9aa3ab' : club.trim) : club.fill
  const b = dark(club.trim) || club.trim === a ? a : club.trim
  return { a, b }
}
