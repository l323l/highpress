import { describe, expect, it } from 'vitest'
import { MARK_LIMITS, markAt, markerActive, recordMarkKey, removeMarkKey, setMarkKey, type MarkKey, type Marker } from './clip'

const key = (t: number, x: number, y: number): MarkKey => ({ t, x, y })

describe('선수 강조 표시', () => {
  it('위치를 시각 순서로 찍는다', () => {
    let keys: MarkKey[] = []
    keys = setMarkKey(keys, key(5, 0.5, 0.5))
    keys = setMarkKey(keys, key(2, 0.1, 0.2))
    expect(keys.map((item) => item.t)).toEqual([2, 5])
  })

  it('같은 시각에 다시 찍으면 그 위치를 옮긴다', () => {
    const keys = setMarkKey([key(2, 0.1, 0.2)], key(2.03, 0.8, 0.9))
    expect(keys).toEqual([key(2, 0.8, 0.9)])
  })

  it('영상 밖의 위치는 안쪽으로 당긴다', () => {
    expect(setMarkKey([], key(1, -0.4, 1.7))).toEqual([key(1, 0, 1)])
  })

  it('한도를 넘으면 더 찍히지 않는다', () => {
    let keys: MarkKey[] = []
    for (let i = 0; i < MARK_LIMITS.maxKeys + 5; i += 1) keys = setMarkKey(keys, key(i, 0.5, 0.5))
    expect(keys).toHaveLength(MARK_LIMITS.maxKeys)
  })

  it('찍은 위치 사이를 곧게 이어 움직인다', () => {
    const keys = [key(10, 0.2, 0.4), key(12, 0.6, 0.8)]
    expect(markAt(keys, 10)).toEqual({ x: 0.2, y: 0.4 })
    const middle = markAt(keys, 11)!
    expect(middle.x).toBeCloseTo(0.4)
    expect(middle.y).toBeCloseTo(0.6)
    expect(markAt(keys, 12)).toEqual({ x: 0.6, y: 0.8 })
  })

  it('첫 위치 앞과 마지막 위치 뒤에는 보이지 않는다', () => {
    const keys = [key(10, 0.2, 0.4), key(12, 0.6, 0.8)]
    expect(markAt(keys, 9.9)).toBeNull()
    expect(markAt(keys, 12.1)).toBeNull()
    expect(markAt([], 3)).toBeNull()
  })

  it('한 군데만 찍으면 그때부터 잠깐 보인다', () => {
    const keys = [key(10, 0.3, 0.3)]
    expect(markAt(keys, 10.5)).toEqual({ x: 0.3, y: 0.3 })
    expect(markAt(keys, 10 + MARK_LIMITS.singleSeconds + 0.1)).toBeNull()
  })

  it('위치가 많아도 지금 시각 앞뒤의 두 위치 사이를 잇는다', () => {
    const keys = Array.from({ length: 600 }, (_, i) => key(i / 10, i / 600, 0.5))
    const at = markAt(keys, 30.05)!
    expect(at.x).toBeCloseTo(300.5 / 600)
    expect(markAt(keys, 59.9)).toEqual({ x: 599 / 600, y: 0.5 })
  })

  it('재생하며 기록하면 지나온 구간의 예전 위치를 새 위치로 바꾼다', () => {
    const old = [key(1, 0.1, 0.1), key(1.2, 0.2, 0.2), key(1.4, 0.3, 0.3), key(3, 0.9, 0.9)]
    // 1.0초부터 1.5초까지 다시 기록했다.
    const keys = recordMarkKey(old, 1, key(1.5, 0.7, 0.7))
    expect(keys).toEqual([key(1, 0.1, 0.1), key(1.5, 0.7, 0.7), key(3, 0.9, 0.9)])
  })

  it('이어서 기록하면 구간 끝까지 위치가 쌓인다', () => {
    let keys: MarkKey[] = [key(0, 0.5, 0.5)]
    let last = 0
    for (let t = 0.1; t <= 20.001; t += MARK_LIMITS.recordSeconds) {
      keys = recordMarkKey(keys, last, key(t, 0.5, 0.5))
      last = Math.round(t * 100) / 100
    }
    expect(keys.length).toBe(201)
    expect(keys[keys.length - 1].t).toBe(20)
    expect(markAt(keys, 19.95)).not.toBeNull()
  })

  it('그 시각의 위치만 지운다', () => {
    expect(removeMarkKey([key(1, 0, 0), key(2, 0, 0)], 2.02)).toEqual([key(1, 0, 0)])
  })

  it('내보낼 구간에 걸치는 표시만 그린다', () => {
    const marker: Marker = { keys: [key(10, 0.2, 0.4), key(12, 0.6, 0.8)], size: 0.08, color: '#ffe600' }
    expect(markerActive(marker, { start: 11, end: 20 })).toBe(true)
    expect(markerActive(marker, { start: 13, end: 20 })).toBe(false)
    expect(markerActive({ ...marker, keys: [] }, { start: 0, end: 20 })).toBe(false)
    expect(markerActive(undefined, { start: 0, end: 20 })).toBe(false)
  })
})
