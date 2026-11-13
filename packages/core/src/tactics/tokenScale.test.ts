import { describe, expect, it } from 'vitest'
import { TOKEN_RADIUS, tokenRadius } from './geometry'
import { createDefaultProject as createDefaultProjectWith, resetScales, setPlayerScale, setTokenScale } from './projectOps'

// id 를 만드는 함수는 밖에서 받는다. 시험에서는 차례 번호로 만든다.
let seq = 0
const createDefaultProject = (columnId: string) => createDefaultProjectWith(columnId, () => `id-${++seq}`)

describe('선수 크기', () => {
  it('전체 크기와 선수별 크기를 곱해 반지름을 정한다', () => {
    expect(tokenRadius()).toBe(TOKEN_RADIUS)
    expect(tokenRadius(1.5)).toBe(TOKEN_RADIUS * 1.5)
    expect(tokenRadius(1.5, 2)).toBe(TOKEN_RADIUS * 3)
  })

  it('범위를 벗어난 값은 범위 안으로 당긴다', () => {
    expect(tokenRadius(10)).toBe(TOKEN_RADIUS * 2)
    expect(tokenRadius(0.01)).toBe(TOKEN_RADIUS * 0.5)
    expect(tokenRadius(Number.NaN)).toBe(TOKEN_RADIUS)
  })

  it('전체 크기를 바꾸고, 기본값이면 값을 남기지 않는다', () => {
    const project = createDefaultProject('c')
    expect(setTokenScale(project, 1.4).tokenScale).toBe(1.4)
    expect(setTokenScale(project, 9).tokenScale).toBe(2)
    expect('tokenScale' in setTokenScale(setTokenScale(project, 1.4), 1)).toBe(false)
    expect(setTokenScale(project, Number.NaN)).toBe(project)
  })

  it('선수 한 명의 크기만 바꾼다', () => {
    const project = createDefaultProject('c')
    const scaled = setPlayerScale(project, 'a1', 1.6)
    expect(scaled.tokens.find((token) => token.id === 'a1')?.scale).toBe(1.6)
    expect(scaled.tokens.filter((token) => token.scale !== undefined)).toHaveLength(1)
    expect(setPlayerScale(scaled, 'a1', null).tokens.some((token) => 'scale' in token)).toBe(false)
    expect(setPlayerScale(project, 'nobody', 1.6)).toBe(project)
  })

  it('기본 크기로 돌리면 전체와 선수별 크기를 모두 지운다', () => {
    const project = createDefaultProject('c')
    const scaled = setPlayerScale(setTokenScale(project, 1.4), 'b3', 0.7)
    const reset = resetScales(scaled)
    expect('tokenScale' in reset).toBe(false)
    expect(reset.tokens.some((token) => 'scale' in token)).toBe(false)
    expect(resetScales(project)).toBe(project)
  })
})
