import { describe, expect, it } from 'vitest'
import type { Point, TacticProject } from '../db/types'
import {
  easeInOut,
  frameTimes,
  HOLD_MS,
  MAX_FRAMES,
  positionsAt,
  sceneIndexAt,
  sceneRangeMs,
  sceneStart,
  TooManyFramesError,
  totalDurationMs,
} from './animation'
import { gifFrames } from './gifFrames'

// 첫 점은 시작 위치이고, 그다음 점마다 "그 점까지 durationMs 동안 이동하는 장면" 하나가 된다.
// 점이 하나뿐이면 제자리에 머무는 장면 하나.
function project(points: { at: Point; durationMs: number }[]): TacticProject {
  const [first, ...rest] = points
  const moves = rest.length > 0 ? rest : [first]
  return {
    id: 'p',
    columnId: 'c',
    teamColors: { a: '#00f', b: '#f0f' },
    tokens: [{ id: 't', team: 'a' }],
    scenes: moves.map((move, i) => ({
      id: `s${i}`,
      positions: { t: move.at },
      durationMs: move.durationMs,
      ...(i === 0 ? { start: { t: first.at } } : {}),
    })),
    updatedAt: 0,
  }
}

// 장면 하나: (0,0)에서 (1,0.5)까지 2초
const two = project([
  { at: { x: 0, y: 0 }, durationMs: 1000 },
  { at: { x: 1, y: 0.5 }, durationMs: 2000 },
])

// 장면 둘: (0,0) → (1,0) 0.3초, 이어서 (1,0) → (1,1) 5초
const three = project([
  { at: { x: 0, y: 0 }, durationMs: 9999 },
  { at: { x: 1, y: 0 }, durationMs: 300 },
  { at: { x: 1, y: 1 }, durationMs: 5000 },
])

describe('animation', () => {
  it('장면은 앞 장면의 도착 위치에서 시작한다', () => {
    expect(sceneStart(three, 0).t).toEqual({ x: 0, y: 0 })
    expect(sceneStart(three, 1)).toBe(three.scenes[0].positions)
    // 시작 위치를 따로 두지 않은 첫 장면은 제자리에서 시작한다
    const noStart: TacticProject = { ...two, scenes: [{ id: 's', positions: { t: { x: 1, y: 1 } }, durationMs: 500 }] }
    expect(sceneStart(noStart, 0).t).toEqual({ x: 1, y: 1 })
    expect(sceneStart({ ...two, scenes: [] }, 0)).toEqual({})
  })

  it('도형은 시작에 멈춰 있거나 움직이는 중인 장면의 것을 보여 준다', () => {
    expect(sceneIndexAt(three, -10)).toBe(0)
    expect(sceneIndexAt(three, HOLD_MS)).toBe(0)
    expect(sceneIndexAt(three, HOLD_MS + 299)).toBe(0)
    // 장면 1의 이동이 끝나면 장면 2의 시작 멈춤이다
    expect(sceneIndexAt(three, HOLD_MS + 300)).toBe(1)
    expect(sceneIndexAt(three, 1e9)).toBe(1)
    expect(sceneIndexAt({ ...two, scenes: [] }, 0)).toBe(0)

    const frames = gifFrames(three, 20)
    expect(frames[0].sceneIndex).toBe(0)
    expect(frames.at(-1)?.sceneIndex).toBe(1)
  })

  it('장면 하나만 재생하는 구간은 그 장면의 시작 멈춤부터 도착 멈춤까지다', () => {
    expect(sceneRangeMs(three, 0)).toEqual({ fromMs: 0, toMs: HOLD_MS + 300 + HOLD_MS })
    const second = sceneRangeMs(three, 1)
    expect(second).toEqual({ fromMs: HOLD_MS + 300, toMs: HOLD_MS + 300 + HOLD_MS + 5000 + HOLD_MS })
    expect(second.toMs).toBe(totalDurationMs(three))
    // 구간의 양 끝은 그 장면의 시작 위치와 도착 위치다
    expect(positionsAt(three, second.fromMs).t).toEqual({ x: 1, y: 0 })
    expect(positionsAt(three, second.toMs).t).toEqual({ x: 1, y: 1 })
  })

  it('easeInOut은 양 끝과 가운데를 지나고 대칭이다', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    expect(easeInOut(0.25)).toBeLessThan(0.25)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1)
  })

  it('전체 길이 = 처음 멈춤 + 장면마다 (이동 시간 + 멈춤)', () => {
    expect(totalDurationMs(project([{ at: { x: 0, y: 0 }, durationMs: 1000 }]))).toBe(HOLD_MS * 2 + 1000)
    expect(totalDurationMs(two)).toBe(HOLD_MS * 2 + 2000)
    expect(totalDurationMs(three)).toBe(HOLD_MS * 3 + 5300)
    expect(totalDurationMs({ ...two, scenes: [] })).toBe(0)
  })

  it('처음과 끝, 범위 밖 시각은 첫·마지막 장면 위치다', () => {
    expect(positionsAt(two, 0).t).toEqual({ x: 0, y: 0 })
    expect(positionsAt(two, -50).t).toEqual({ x: 0, y: 0 })
    expect(positionsAt(two, totalDurationMs(two)).t).toEqual({ x: 1, y: 0.5 })
    expect(positionsAt(two, 1e9).t).toEqual({ x: 1, y: 0.5 })
  })

  it('멈춤 구간에서는 움직이지 않는다', () => {
    expect(positionsAt(two, HOLD_MS).t).toEqual({ x: 0, y: 0 })
    expect(positionsAt(two, HOLD_MS + 2000).t).toEqual({ x: 1, y: 0.5 })
    expect(positionsAt(two, HOLD_MS + 2000 + HOLD_MS / 2).t).toEqual({ x: 1, y: 0.5 })
  })

  it('이동 구간 한가운데는 두 장면의 중간이고, 초반은 천천히 움직인다', () => {
    const mid = positionsAt(two, HOLD_MS + 1000).t
    expect(mid.x).toBeCloseTo(0.5)
    expect(mid.y).toBeCloseTo(0.25)
    const early = positionsAt(two, HOLD_MS + 500).t
    expect(early.x).toBeCloseTo(0.125)
    expect(early.x).toBeLessThan(0.25)
  })

  it('시작이나 도착 한쪽에만 있는 토큰은 있는 쪽 위치에 머문다', () => {
    const missing: TacticProject = { ...two, scenes: [{ ...two.scenes[0], start: {} }] }
    expect(positionsAt(missing, HOLD_MS + 1000).t).toEqual({ x: 1, y: 0.5 })
  })

  it('frameTimes는 길이×fps 만큼의 등간격 시각을 준다', () => {
    const times = frameTimes(two, 30)
    expect(times).toHaveLength(Math.round((2800 * 30) / 1000))
    expect(times[0]).toBe(0)
    expect(times[1]).toBeCloseTo(1000 / 30)
    expect(times.at(-1)).toBeLessThan(totalDurationMs(two))
    expect(frameTimes(two, 20)).toHaveLength(56)
    expect(frameTimes(project([{ at: { x: 0, y: 0 }, durationMs: 1000 }]), 20)).toHaveLength(36)
    expect(frameTimes({ ...two, scenes: [] }, 20)).toHaveLength(1)
  })

  it('프레임 수가 상한을 넘거나 길이가 숫자가 아니면 한국어 오류를 던진다', () => {
    const at = { x: 0, y: 0 }
    // 화면에서 만들 수 있는 가장 긴 프로젝트: 장면 50개 × 5초
    const longest = project(Array.from({ length: 51 }, () => ({ at, durationMs: 5000 })))
    expect(longest.scenes).toHaveLength(50)
    expect(frameTimes(longest, 30).length).toBeLessThanOrEqual(MAX_FRAMES)

    const huge = project([
      { at, durationMs: 1000 },
      { at, durationMs: 1e12 },
    ])
    expect(() => frameTimes(huge, 30)).toThrow(TooManyFramesError)
    expect(() => frameTimes(huge, 30)).toThrow('애니메이션이 너무 길어')
    expect(() => gifFrames(huge)).toThrow(TooManyFramesError)
    for (const durationMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => frameTimes(project([{ at, durationMs: 1000 }, { at, durationMs }]), 30)).toThrow(TooManyFramesError)
    }
  })

  it('GIF 프레임은 멈춤 구간을 한 장으로 합치되 전체 길이는 그대로다', () => {
    const frames = gifFrames(two, 20)
    expect(frames.length).toBeLessThan(frameTimes(two, 20).length)
    expect(frames.reduce((sum, frame) => sum + frame.delayMs, 0)).toBeCloseTo(totalDurationMs(two))
    expect(frames[0].delayMs).toBeGreaterThanOrEqual(HOLD_MS)
    expect(frames[0].positions.t).toEqual({ x: 0, y: 0 })
    expect(frames.at(-1)?.positions.t).toEqual({ x: 1, y: 0.5 })
  })
})
