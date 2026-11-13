import type { Point, TacticProject } from '../db/types'

// 각 장면의 시작과 끝에서 잠깐 멈추는 시간 (M-7).
export const HOLD_MS = 400

// 내보내기 한 번에 만들 수 있는 프레임 수의 상한.
// 화면에서 만들 수 있는 가장 긴 프로젝트(50장면 × 5초, 30fps ≈ 8,112프레임)는 통과한다.
export const MAX_FRAMES = 8200

export class TooManyFramesError extends Error {
  constructor() {
    super('애니메이션이 너무 길어 내보낼 수 없습니다. 장면 수나 이동 시간을 줄여 주세요.')
    this.name = 'TooManyFramesError'
  }
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

type Positions = Record<string, Point>

// 장면 i가 시작할 때의 위치: 첫 장면은 직접 정한 시작 위치, 그다음부터는 앞 장면의 도착 위치.
export function sceneStart(project: TacticProject, index: number): Positions {
  const first = project.scenes[0]
  if (!first) return {}
  return index <= 0 ? (first.start ?? first.positions) : (project.scenes[index - 1]?.positions ?? {})
}

// 재생 순서: [멈춤] → 장면 1 이동 → [멈춤] → 장면 2 이동 → … → [멈춤]
export function totalDurationMs(project: TacticProject): number {
  if (project.scenes.length === 0) return 0
  return project.scenes.reduce((sum, scene) => sum + scene.durationMs + HOLD_MS, HOLD_MS)
}

// 장면 하나만 재생할 때의 구간: 시작 멈춤부터 도착 멈춤까지.
export function sceneRangeMs(project: TacticProject, index: number): { fromMs: number; toMs: number } {
  const scenes = project.scenes.slice(0, Math.max(0, index))
  const fromMs = scenes.reduce((sum, scene) => sum + HOLD_MS + scene.durationMs, 0)
  return { fromMs, toMs: fromMs + HOLD_MS + (project.scenes[index]?.durationMs ?? 0) + HOLD_MS }
}

function blend(from: Positions, to: Positions, progress: number): Positions {
  const k = easeInOut(progress)
  const positions: Positions = {}
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[id] ?? to[id]
    const b = to[id] ?? a
    positions[id] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }
  return positions
}

// 그 시각이 어느 장면의 어디쯤인지. progress가 null이면 그 장면의 시작 위치에 멈춰 있다.
function locate(project: TacticProject, tMs: number): { index: number; progress: number | null } | null {
  const { scenes } = project
  let t = Math.max(0, tMs)
  for (let i = 0; i < scenes.length; i++) {
    if (t <= HOLD_MS) return { index: i, progress: null }
    t -= HOLD_MS
    if (t < scenes[i].durationMs) return { index: i, progress: t / scenes[i].durationMs }
    t -= scenes[i].durationMs
  }
  return null
}

export function positionsAt(project: TacticProject, tMs: number): Positions {
  const { scenes } = project
  if (scenes.length === 0) return {}
  const at = locate(project, tMs)
  if (!at) return scenes[scenes.length - 1].positions
  const start = sceneStart(project, at.index)
  return at.progress === null ? start : blend(start, scenes[at.index].positions, at.progress)
}

// 그 시각에 도형을 보여 줄 장면: 시작에 멈춰 있거나 움직이는 중인 장면. 끝난 뒤에는 마지막 장면.
export function sceneIndexAt(project: TacticProject, tMs: number): number {
  return locate(project, tMs)?.index ?? Math.max(0, project.scenes.length - 1)
}

// 내보내기용 프레임 시각 목록. 프레임 i는 [i/fps, (i+1)/fps) 구간을 대표한다.
// 길이가 비정상적으로 긴 프로젝트(손상되거나 조작된 데이터)는 인코딩을 시작하지 않는다.
export function frameTimes(project: TacticProject, fps: number): number[] {
  const count = Math.max(1, Math.round((totalDurationMs(project) * fps) / 1000))
  if (!(count <= MAX_FRAMES)) throw new TooManyFramesError()
  return Array.from({ length: count }, (_, i) => (i * 1000) / fps)
}
