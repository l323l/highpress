import type { Point } from '../db/types'

export const DEFAULT_PITCH_COLOR = '#7fd6b4'
export const LINE_COLOR = '#ffffff'
export const LINE_WIDTH = 3
export const TOKEN_RADIUS = 20
export const BALL_RADIUS = 10

// 선수 원의 크기 배율: 전체 배율 × 그 선수의 배율. 범위를 벗어난 값은 범위 안으로 당긴다.
export const TOKEN_SCALE = { min: 0.5, max: 2 } as const

export function clampTokenScale(scale: unknown): number {
  return typeof scale === 'number' && Number.isFinite(scale) ? Math.min(TOKEN_SCALE.max, Math.max(TOKEN_SCALE.min, scale)) : 1
}

export function tokenRadius(projectScale?: number, tokenScale?: number): number {
  return TOKEN_RADIUS * clampTokenScale(projectScale ?? 1) * clampTokenScale(tokenScale ?? 1)
}
export const SPOT_RADIUS = 4
export const NAME_FONT_SIZE = 22
export const SHAPE_WIDTH = 5
export const ARROW_HEAD = 20
export const SHAPE_DASH = [16, 12]

// 실제 규격(m)
export const PITCH_LENGTH_M = 105
export const PITCH_WIDTH_M = 68
const PENALTY_DEPTH_M = 16.5
const PENALTY_WIDTH_M = 40.32
const GOAL_AREA_DEPTH_M = 5.5
const GOAL_AREA_WIDTH_M = 18.32
const CENTRE_CIRCLE_M = 9.15

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// 가상 무대 크기. 화면 표시와 내보내기 모두 이 좌표계를 기준으로 그린 뒤 배율만 바꾼다.
// 무대 전체가 경기장 색이고, 선 바깥에는 토큰이 걸칠 만큼의 여백만 둔다.
export const STAGE_W = 1280
const MARGIN = 36
const PITCH_STAGE_W = STAGE_W - MARGIN * 2
const PITCH_STAGE_H = (PITCH_STAGE_W * PITCH_WIDTH_M) / PITCH_LENGTH_M
// 영상 인코더가 짝수 크기를 요구한다.
export const STAGE_H = Math.ceil((PITCH_STAGE_H + MARGIN * 2) / 2) * 2

export const PITCH: Rect = {
  x: MARGIN,
  y: (STAGE_H - PITCH_STAGE_H) / 2,
  width: PITCH_STAGE_W,
  height: PITCH_STAGE_H,
}

const M = PITCH.width / PITCH_LENGTH_M

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampPoint(p: Point): Point {
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }
}

export function toStage(p: Point): Point {
  return { x: PITCH.x + p.x * PITCH.width, y: PITCH.y + p.y * PITCH.height }
}

export function toNormalised(p: Point): Point {
  return { x: (p.x - PITCH.x) / PITCH.width, y: (p.y - PITCH.y) / PITCH.height }
}

function box(side: 'left' | 'right', depthM: number, widthM: number): Rect {
  const width = depthM * M
  const height = widthM * M
  return {
    x: side === 'left' ? PITCH.x : PITCH.x + PITCH.width - width,
    y: PITCH.y + (PITCH.height - height) / 2,
    width,
    height,
  }
}

const CENTRE: Point = { x: PITCH.x + PITCH.width / 2, y: PITCH.y + PITCH.height / 2 }

// 흰색 라인 전체 (M-2). 사각형은 테두리만, 원은 테두리만, spot은 채운 점.
export const PITCH_LINES = {
  rects: [
    PITCH,
    box('left', PENALTY_DEPTH_M, PENALTY_WIDTH_M),
    box('right', PENALTY_DEPTH_M, PENALTY_WIDTH_M),
    box('left', GOAL_AREA_DEPTH_M, GOAL_AREA_WIDTH_M),
    box('right', GOAL_AREA_DEPTH_M, GOAL_AREA_WIDTH_M),
  ] as Rect[],
  halfway: { from: { x: CENTRE.x, y: PITCH.y }, to: { x: CENTRE.x, y: PITCH.y + PITCH.height } },
  circle: { ...CENTRE, radius: CENTRE_CIRCLE_M * M },
  spot: { ...CENTRE, radius: SPOT_RADIUS },
}

export interface StageFit {
  width: number
  height: number
  scale: number
}

// 주어진 칸 안에 무대 비율을 유지하며 들어가는 가장 큰 크기 (M-11).
export function fitStage(containerWidth: number, containerHeight: number): StageFit {
  const scale = Math.max(0, Math.min(containerWidth / STAGE_W, containerHeight / STAGE_H))
  return { width: STAGE_W * scale, height: STAGE_H * scale, scale }
}
