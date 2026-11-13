import { describe, expect, it } from 'vitest'
import {
  clampPoint,
  fitStage,
  PITCH,
  PITCH_LENGTH_M,
  PITCH_LINES,
  PITCH_WIDTH_M,
  STAGE_H,
  STAGE_W,
  TOKEN_RADIUS,
  toNormalised,
  toStage,
} from './geometry'

describe('geometry', () => {
  it('경기장은 105:68 비율로 무대를 거의 다 채우며 가운데에 놓인다', () => {
    // 검은 여백 없이, 토큰이 걸칠 만큼의 가장자리만 남긴다.
    expect(PITCH.width / STAGE_W).toBeGreaterThan(0.9)
    expect(PITCH.height / STAGE_H).toBeGreaterThan(0.9)
    expect(PITCH.x).toBeGreaterThanOrEqual(TOKEN_RADIUS)
    expect(PITCH.y).toBeGreaterThanOrEqual(TOKEN_RADIUS)
    // 영상 인코더가 짝수 크기를 요구한다.
    expect(STAGE_W % 2).toBe(0)
    expect(STAGE_H % 2).toBe(0)
    expect(PITCH.width / PITCH.height).toBeCloseTo(PITCH_LENGTH_M / PITCH_WIDTH_M)
    expect(PITCH.x).toBeCloseTo(STAGE_W - PITCH.x - PITCH.width)
    expect(PITCH.y).toBeCloseTo(STAGE_H - PITCH.y - PITCH.height)
    expect(PITCH.x).toBeGreaterThan(0)
    expect(PITCH.y).toBeGreaterThan(0)
  })

  it('정규화 좌표와 무대 좌표를 서로 되돌릴 수 있다', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.25, y: 0.8 },
    ]) {
      const back = toNormalised(toStage(p))
      expect(back.x).toBeCloseTo(p.x)
      expect(back.y).toBeCloseTo(p.y)
    }
    expect(toStage({ x: 0, y: 0 })).toEqual({ x: PITCH.x, y: PITCH.y })
    expect(toStage({ x: 1, y: 1 })).toEqual({ x: PITCH.x + PITCH.width, y: PITCH.y + PITCH.height })
  })

  it('경기장 밖 좌표는 가장자리로 당겨진다', () => {
    expect(clampPoint({ x: -0.3, y: 1.7 })).toEqual({ x: 0, y: 1 })
    expect(clampPoint({ x: 0.4, y: 0.6 })).toEqual({ x: 0.4, y: 0.6 })
  })

  it('모든 라인이 경기장(따라서 프레임) 안에 있다', () => {
    const right = PITCH.x + PITCH.width
    const bottom = PITCH.y + PITCH.height
    expect(PITCH_LINES.rects).toHaveLength(5)
    for (const rect of PITCH_LINES.rects) {
      expect(rect.x).toBeGreaterThanOrEqual(PITCH.x)
      expect(rect.y).toBeGreaterThanOrEqual(PITCH.y)
      expect(rect.x + rect.width).toBeLessThanOrEqual(right + 1e-9)
      expect(rect.y + rect.height).toBeLessThanOrEqual(bottom + 1e-9)
    }
    const { circle, halfway } = PITCH_LINES
    expect(circle.y - circle.radius).toBeGreaterThan(PITCH.y)
    expect(circle.y + circle.radius).toBeLessThan(bottom)
    expect(halfway.from.x).toBeCloseTo(STAGE_W / 2)
    expect(halfway.from.y).toBeCloseTo(PITCH.y)
    expect(halfway.to.y).toBeCloseTo(bottom)
  })

  it('박스와 센터서클은 실제 규격 비율을 따른다', () => {
    const m = PITCH.width / PITCH_LENGTH_M
    const [, penaltyLeft, penaltyRight, goalLeft, goalRight] = PITCH_LINES.rects
    expect(penaltyLeft.width).toBeCloseTo(16.5 * m)
    expect(penaltyLeft.height).toBeCloseTo(40.32 * m)
    expect(goalLeft.width).toBeCloseTo(5.5 * m)
    expect(goalLeft.height).toBeCloseTo(18.32 * m)
    expect(PITCH_LINES.circle.radius).toBeCloseTo(9.15 * m)
    // 좌우 대칭
    expect(penaltyLeft.x).toBeCloseTo(PITCH.x)
    expect(penaltyRight.x + penaltyRight.width).toBeCloseTo(PITCH.x + PITCH.width)
    expect(goalRight.x + goalRight.width).toBeCloseTo(PITCH.x + PITCH.width)
    expect(penaltyLeft.y + penaltyLeft.height / 2).toBeCloseTo(STAGE_H / 2)
  })

  it('fitStage는 가로·세로 중 좁은 쪽에 맞추고 무대 비율을 유지한다', () => {
    const ratio = STAGE_W / STAGE_H
    expect(fitStage(STAGE_W, STAGE_H)).toEqual({ width: STAGE_W, height: STAGE_H, scale: 1 })
    const wide = fitStage(4000, STAGE_H / 2)
    expect(wide.height).toBeCloseTo(STAGE_H / 2)
    expect(wide.width / wide.height).toBeCloseTo(ratio)
    const tall = fitStage(STAGE_W / 2, 4000)
    expect(tall.width).toBeCloseTo(STAGE_W / 2)
    expect(tall.width / tall.height).toBeCloseTo(ratio)
    expect(fitStage(0, 500).scale).toBe(0)
  })
})
