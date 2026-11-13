import type { Point, TeamSide } from '../db/types'

// 골키퍼를 뺀 줄별 인원 (수비 → 공격 순).
export const FORMATIONS = {
  '4-3-3': [4, 3, 3],
  '4-4-2': [4, 4, 2],
  '3-5-2': [3, 5, 2],
  '4-2-3-1': [4, 2, 3, 1],
  '3-4-3': [3, 4, 3],
} as const satisfies Record<string, readonly number[]>

export type FormationId = keyof typeof FORMATIONS

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[]

export const PLAYERS_PER_TEAM = 11

const KEEPER_X = 0.04
const FIRST_LINE_X = 0.14
const LAST_LINE_X = 0.44

// 팀 A는 왼쪽 절반에서 오른쪽으로 공격하고, 팀 B는 좌우를 뒤집어 놓는다 (M-5).
export function formationPositions(id: FormationId, team: TeamSide): Point[] {
  const lines: readonly number[] = FORMATIONS[id]
  const points: Point[] = [{ x: KEEPER_X, y: 0.5 }]
  lines.forEach((count, lineIndex) => {
    const x = FIRST_LINE_X + ((LAST_LINE_X - FIRST_LINE_X) * lineIndex) / (lines.length - 1)
    for (let i = 0; i < count; i++) points.push({ x, y: (i + 1) / (count + 1) })
  })
  return team === 'a' ? points : points.map((p) => ({ x: 1 - p.x, y: p.y }))
}
