import { describe, expect, it } from 'vitest'
import { FORMATION_IDS, formationPositions, FORMATIONS } from './formations'

describe('formations', () => {
  it('요구된 프리셋을 모두 제공한다', () => {
    expect(FORMATION_IDS).toEqual(['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '3-4-3'])
  })

  it.each(FORMATION_IDS)('%s: 팀마다 11명이 자기 진영 안에 서로 다른 자리에 선다', (id) => {
    expect(FORMATIONS[id].reduce((sum: number, n) => sum + n, 0)).toBe(10)
    const a = formationPositions(id, 'a')
    const b = formationPositions(id, 'b')
    expect(a).toHaveLength(11)
    expect(b).toHaveLength(11)
    for (const p of a) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(0.5)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(1)
    }
    for (const p of b) {
      expect(p.x).toBeGreaterThan(0.5)
      expect(p.x).toBeLessThan(1)
    }
    expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBe(11)
  })

  it.each(FORMATION_IDS)('%s: 팀 B는 팀 A를 좌우로 뒤집은 것이다', (id) => {
    const a = formationPositions(id, 'a')
    const b = formationPositions(id, 'b')
    a.forEach((p, i) => {
      expect(b[i].x).toBeCloseTo(1 - p.x)
      expect(b[i].y).toBeCloseTo(p.y)
    })
  })

  it('골키퍼는 골문 앞 가운데, 줄은 수비에서 공격 순으로 놓인다', () => {
    const [keeper, ...rest] = formationPositions('4-3-3', 'a')
    expect(keeper.y).toBe(0.5)
    expect(keeper.x).toBeLessThan(Math.min(...rest.map((p) => p.x)))
    expect(rest.slice(0, 4).every((p) => p.x === rest[0].x)).toBe(true)
    expect(rest[4].x).toBeGreaterThan(rest[0].x)
    expect(rest[9].x).toBeGreaterThan(rest[4].x)
  })
})
