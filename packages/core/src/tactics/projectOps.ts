import type { NewId } from '../db/ids'
import {
  BALL_ID,
  TACTIC_LIMITS,
  type Point,
  type Scene,
  type Shape,
  type TacticProject,
  type TeamSide,
  type TokenDef,
} from '../db/types'
import { formationPositions, PLAYERS_PER_TEAM, type FormationId } from './formations'
import { clamp, clampPoint, clampTokenScale, DEFAULT_PITCH_COLOR } from './geometry'

export const DEFAULT_TEAM_COLORS: Record<TeamSide, string> = { a: '#3b6cff', b: '#ff6fae' }
export const DEFAULT_SHAPE_COLOR = '#ffe066'
export const MIN_DURATION_MS = TACTIC_LIMITS.minDurationMs
export const MAX_DURATION_MS = TACTIC_LIMITS.maxDurationMs
export const DEFAULT_DURATION_MS = 1000
const CENTRE: Point = { x: 0.5, y: 0.5 }

// <input type="color">가 주는 꼴만 받는다.
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

// fn이 장면을 그대로 돌려주면 프로젝트도 그대로 돌려준다 (바뀐 게 없으면 저장하지 않는다).
function withScene(project: TacticProject, index: number, fn: (scene: Scene) => Scene): TacticProject {
  const current = project.scenes[index]
  if (!current) return project
  const next = fn(current)
  if (next === current) return project
  return { ...project, scenes: project.scenes.map((scene, i) => (i === index ? next : scene)) }
}

function withToken(project: TacticProject, tokenId: string, fn: (token: TokenDef) => TokenDef): TacticProject {
  if (!project.tokens.some((token) => token.id === tokenId)) return project
  return { ...project, tokens: project.tokens.map((token) => (token.id === tokenId ? fn(token) : token)) }
}

// 장면에서 고치는 쪽: 시작 위치 또는 도착 위치.
export type Phase = 'start' | 'end'

const samePoint = (a: Point | undefined, b: Point | undefined) => !!a && !!b && a.x === b.x && a.y === b.y

// 장면의 시작 또는 도착 위치를 고친다. 시작 위치는 첫 장면에서만 고칠 수 있다
// (그다음 장면의 시작은 앞 장면의 도착 위치이므로 그쪽에서 고친다).
// 첫 장면의 시작을 고칠 때, 아직 움직이지 않은(시작=도착) 선수는 도착 위치도 함께 따라간다.
function editPositions(
  project: TacticProject,
  sceneIndex: number,
  phase: Phase,
  change: (positions: Record<string, Point>) => Record<string, Point>,
): TacticProject {
  if (phase === 'end') return withScene(project, sceneIndex, (scene) => ({ ...scene, positions: change(scene.positions) }))
  if (sceneIndex !== 0) return project
  return withScene(project, 0, (scene) => {
    const before = scene.start ?? scene.positions
    const start = change(before)
    const positions = { ...scene.positions }
    for (const id of Object.keys(start)) {
      if (!scene.positions[id] || samePoint(scene.positions[id], before[id])) positions[id] = start[id]
    }
    return { ...scene, start, positions }
  })
}

// 해당 팀 토큰만 프리셋 자리로 옮긴다. 다른 팀과 다른 장면은 그대로 둔다 (M-5).
export function applyFormation(
  project: TacticProject,
  sceneIndex: number,
  team: TeamSide,
  formation: FormationId,
  phase: Phase = 'end',
): TacticProject {
  const points = formationPositions(formation, team)
  const teamTokens = project.tokens.filter((token) => token.team === team)
  return editPositions(project, sceneIndex, phase, (current) => {
    const positions = { ...current }
    teamTokens.forEach((token, i) => {
      if (points[i]) positions[token.id] = points[i]
    })
    return positions
  })
}

// newId: 프로젝트 · 장면 id를 만드는 함수 (웹 crypto.randomUUID, 앱 expo-crypto).
export function createDefaultProject(columnId: string, newId: NewId): TacticProject {
  const tokens: TokenDef[] = (['a', 'b'] as const).flatMap((team) =>
    Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => ({ id: `${team}${i + 1}`, team })),
  )
  const empty: TacticProject = {
    id: newId(),
    columnId,
    teamColors: { ...DEFAULT_TEAM_COLORS },
    pitchColor: DEFAULT_PITCH_COLOR,
    tokens,
    scenes: [{ id: newId(), positions: { [BALL_ID]: CENTRE }, durationMs: DEFAULT_DURATION_MS, shapes: [] }],
    updatedAt: Date.now(),
  }
  const placed = applyFormation(applyFormation(empty, 0, 'a', '4-3-3'), 0, 'b', '4-4-2')
  // 처음에는 시작 위치와 도착 위치가 같다 (아직 움직임 없음).
  return withScene(placed, 0, (scene) => ({ ...scene, start: { ...scene.positions } }))
}

const withBall = (positions: Record<string, Point>) => (positions[BALL_ID] ? positions : { ...positions, [BALL_ID]: CENTRE })

// 예전에 저장된 프로젝트를 지금 모양으로 맞춘다.
// 1) 예전 방식(장면 = 한 순간, 장면과 장면 사이를 이동)을 지금 방식(장면 = 한 번의 이동)으로 바꾼다.
//    같은 애니메이션이 되도록 첫 장면은 시작 위치가 되고, 나머지가 차례로 도착 위치가 된다.
// 2) 공이 없으면 가운데에 놓는다.
export function normalizeProject(project: TacticProject): TacticProject {
  let scenes = project.scenes
  if (scenes.length === 1 && !scenes[0].start) {
    scenes = [{ ...scenes[0], start: { ...scenes[0].positions } }]
  } else if (scenes.length > 1 && !scenes[0].start) {
    const old = scenes
    scenes = old.slice(1).map((scene, i) => {
      // 예전 도형은 그 장면을 떠나는 동안 보였다. 마지막 장면의 도형은 마지막 이동에 합친다.
      const shapes = [...(old[i].shapes ?? []), ...(i === old.length - 2 ? (scene.shapes ?? []) : [])]
      return i === 0 ? { ...scene, shapes, start: old[0].positions } : { ...scene, shapes }
    })
  }
  const needsBall = scenes.some((scene) => !scene.positions[BALL_ID] || (scene.start && !scene.start[BALL_ID]))
  if (needsBall) {
    scenes = scenes.map((scene) => ({
      ...scene,
      positions: withBall(scene.positions),
      ...(scene.start ? { start: withBall(scene.start) } : {}),
    }))
  }
  return scenes === project.scenes ? project : { ...project, scenes }
}

// 새 장면을 바로 뒤에 끼워 넣는다 (M-6). 앞 장면의 도착 위치에서 시작하며 아직 움직임은 없다.
// 도형은 그 장면의 설명이므로 따라가지 않는다.
export function addScene(project: TacticProject, afterIndex: number, newId: NewId): TacticProject {
  const source = project.scenes[afterIndex]
  if (!source || project.scenes.length >= TACTIC_LIMITS.maxScenes) return project
  const copy: Scene = { id: newId(), positions: { ...source.positions }, durationMs: DEFAULT_DURATION_MS, shapes: [] }
  return { ...project, scenes: project.scenes.toSpliced(afterIndex + 1, 0, copy) }
}

export function deleteScene(project: TacticProject, index: number): TacticProject {
  const removed = project.scenes[index]
  if (project.scenes.length <= 1 || !removed) return project
  const scenes = project.scenes.toSpliced(index, 1)
  // 첫 장면을 지우면 둘째 장면이 첫 장면이 된다. 그 장면의 움직임이 바뀌지 않게 시작 위치를 물려준다.
  if (index === 0) scenes[0] = { ...scenes[0], start: removed.positions }
  return { ...project, scenes }
}

// 선수 토큰과 공을 옮긴다.
export function moveToken(
  project: TacticProject,
  sceneIndex: number,
  tokenId: string,
  point: Point,
  phase: Phase = 'end',
): TacticProject {
  if (tokenId !== BALL_ID && !project.tokens.some((token) => token.id === tokenId)) return project
  return editPositions(project, sceneIndex, phase, (positions) => ({ ...positions, [tokenId]: clampPoint(point) }))
}

export function setSceneDuration(project: TacticProject, sceneIndex: number, durationMs: number): TacticProject {
  if (!Number.isFinite(durationMs)) return project
  return withScene(project, sceneIndex, (scene) => ({
    ...scene,
    durationMs: clamp(Math.round(durationMs), MIN_DURATION_MS, MAX_DURATION_MS),
  }))
}

export function setPitchColor(project: TacticProject, color: string): TacticProject {
  return isHexColor(color) ? { ...project, pitchColor: color } : project
}

export function setTeamColor(project: TacticProject, team: TeamSide, color: string): TacticProject {
  return isHexColor(color) ? { ...project, teamColors: { ...project.teamColors, [team]: color } } : project
}

export function setTokenName(project: TacticProject, tokenId: string, name: string): TacticProject {
  const trimmed = name.slice(0, TACTIC_LIMITS.maxNameLength)
  return withToken(project, tokenId, ({ name: _name, ...token }) => (trimmed ? { ...token, name: trimmed } : token))
}

// color가 null이면 개별 색을 지우고 팀 색으로 돌아간다.
export function setTokenColor(project: TacticProject, tokenId: string, color: string | null): TacticProject {
  if (color !== null && !isHexColor(color)) return project
  return withToken(project, tokenId, ({ color: _color, ...token }) => (color ? { ...token, color } : token))
}

// 모든 선수 원의 크기 배율.
export function setTokenScale(project: TacticProject, scale: number): TacticProject {
  if (!Number.isFinite(scale)) return project
  const next = clampTokenScale(scale)
  if (next === 1) {
    const { tokenScale: _scale, ...rest } = project
    return rest
  }
  return { ...project, tokenScale: next }
}

// 선수 한 명의 크기 배율(전체 배율에 곱한다). scale이 null이면 개별 크기를 지운다.
export function setPlayerScale(project: TacticProject, tokenId: string, scale: number | null): TacticProject {
  if (scale !== null && !Number.isFinite(scale)) return project
  const next = scale === null ? 1 : clampTokenScale(scale)
  return withToken(project, tokenId, ({ scale: _scale, ...token }) => (next === 1 ? token : { ...token, scale: next }))
}

// 전체 배율과 선수별 배율을 모두 지워 기본 크기로 돌린다.
export function resetScales(project: TacticProject): TacticProject {
  if (project.tokenScale === undefined && !project.tokens.some((token) => token.scale !== undefined)) return project
  const { tokenScale: _scale, ...rest } = project
  return { ...rest, tokens: rest.tokens.map(({ scale: _own, ...token }) => token) }
}

export function addShape(project: TacticProject, sceneIndex: number, shape: Omit<Shape, 'id'>, newId: NewId): TacticProject {
  if (!isHexColor(shape.color)) return project
  return withScene(project, sceneIndex, (scene) => {
    const shapes = scene.shapes ?? []
    if (shapes.length >= TACTIC_LIMITS.maxShapes) return scene
    return { ...scene, shapes: [...shapes, { ...shape, id: newId(), from: clampPoint(shape.from), to: clampPoint(shape.to) }] }
  })
}

// 도형을 통째로 옮긴다. 양 끝이 경기장을 벗어나지 않는 만큼만 움직인다.
export function moveShape(project: TacticProject, sceneIndex: number, shapeId: string, dx: number, dy: number): TacticProject {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return project
  return withScene(project, sceneIndex, (scene) => ({
    ...scene,
    shapes: (scene.shapes ?? []).map((shape) => {
      if (shape.id !== shapeId) return shape
      const x = clamp(dx, -Math.min(shape.from.x, shape.to.x), 1 - Math.max(shape.from.x, shape.to.x))
      const y = clamp(dy, -Math.min(shape.from.y, shape.to.y), 1 - Math.max(shape.from.y, shape.to.y))
      return { ...shape, from: { x: shape.from.x + x, y: shape.from.y + y }, to: { x: shape.to.x + x, y: shape.to.y + y } }
    }),
  }))
}

export function setShapeColor(project: TacticProject, sceneIndex: number, shapeId: string, color: string): TacticProject {
  if (!isHexColor(color)) return project
  return withScene(project, sceneIndex, (scene) => ({
    ...scene,
    shapes: (scene.shapes ?? []).map((shape) => (shape.id === shapeId ? { ...shape, color } : shape)),
  }))
}

export function deleteShape(project: TacticProject, sceneIndex: number, shapeId: string): TacticProject {
  return withScene(project, sceneIndex, (scene) => ({
    ...scene,
    shapes: (scene.shapes ?? []).filter((shape) => shape.id !== shapeId),
  }))
}

export function clearShapes(project: TacticProject, sceneIndex: number): TacticProject {
  return withScene(project, sceneIndex, (scene) => ((scene.shapes ?? []).length ? { ...scene, shapes: [] } : scene))
}
