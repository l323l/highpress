import { describe, expect, it } from 'vitest'
import { baseName, planCollage, planSingle, sourceProblem, SOURCE_MAX_BYTES } from './collage'

describe('바탕 크기', () => {
  it('한 장은 긴 변을 2000px 까지 줄이고 작은 사진은 그대로 둔다', () => {
    expect(planSingle({ width: 4000, height: 3000 })).toMatchObject({ width: 2000, height: 1500 })
    expect(planSingle({ width: 800, height: 600 })).toMatchObject({ width: 800, height: 600 })
  })

  it('좌우로 붙이면 높이를 작은 쪽에 맞추고, 사진을 자르지 않는다', () => {
    const plan = planCollage({ width: 1200, height: 800 }, { width: 600, height: 600 }, 'row', 0)
    expect(plan.height).toBe(600)
    expect(plan.cells[0]).toEqual({ x: 0, y: 0, w: 900, h: 600 })
    expect(plan.cells[1]).toEqual({ x: 900, y: 0, w: 600, h: 600 })
    expect(plan.width).toBe(1500)
  })

  it('위아래로 붙이면 너비를 작은 쪽에 맞춘다', () => {
    const plan = planCollage({ width: 800, height: 400 }, { width: 1600, height: 1600 }, 'column', 0)
    expect(plan.width).toBe(800)
    expect(plan.cells[0]).toEqual({ x: 0, y: 0, w: 800, h: 400 })
    expect(plan.cells[1]).toEqual({ x: 0, y: 400, w: 800, h: 800 })
  })

  it('사이 간격은 맞춘 변의 백분율이고, 다 붙인 뒤 긴 변을 2000px 로 줄인다', () => {
    const plan = planCollage({ width: 1600, height: 1000 }, { width: 1600, height: 1000 }, 'row', 5)
    // 1600 + 50 + 1600 = 3250 → 2000 으로 줄인다
    expect(plan.width).toBe(2000)
    expect(plan.cells[1].x - plan.cells[0].w).toBe(Math.round(50 * (2000 / 3250)))
    expect(plan.height).toBe(Math.round(1000 * (2000 / 3250)))
  })

  it('간격은 0 ~ 6% 로 묶는다', () => {
    const wide = planCollage({ width: 100, height: 100 }, { width: 100, height: 100 }, 'row', 50)
    expect(wide.cells[1].x - wide.cells[0].w).toBe(6)
  })
})

describe('불러오는 사진 검사', () => {
  it('사진 형식과 크기를 확인한다', () => {
    expect(sourceProblem({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(sourceProblem({ name: 'a.heic', type: 'image/heic', size: 1000 })).toMatch(/PNG, JPG, WebP, GIF/)
    expect(sourceProblem({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/빈 파일/)
    expect(sourceProblem({ name: 'a.png', type: 'image/png', size: SOURCE_MAX_BYTES + 1 })).toMatch(/30MB/)
  })

  it('파일 이름에서 확장자를 뺀다', () => {
    expect(baseName('경기 장면.final.jpg')).toBe('경기 장면.final')
    expect(baseName('.png')).toBe('사진')
  })
})
