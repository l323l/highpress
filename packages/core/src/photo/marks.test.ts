import { describe, expect, it } from 'vitest'
import { commit, defaultMid, emptyHistory, inkOn, MARK_LIMITS, markFromDrag, moveMark, nextNumber, redo, strokeWidth, undo, wavePoints, type Mark } from './marks'

const SIZE = { width: 2000, height: 1000 }
const STYLE = { color: '#ffe14d', size: 2 as const }

describe('표시 계산', () => {
  it('굵기는 사진 크기에 비례한다', () => {
    expect(strokeWidth({ width: 1000, height: 500 }, 2)).toBeCloseTo(5.5)
    expect(strokeWidth(SIZE, 2)).toBeCloseTo(11)
    expect(strokeWidth(SIZE, 3)).toBeGreaterThan(strokeWidth(SIZE, 1))
  })

  it('곡선의 처음 휘어짐은 두 점의 가운데에서 수직으로 민 자리다', () => {
    expect(defaultMid({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 50, y: 18 })
  })

  it('드리블 물결은 시작점에서 출발해 끝점에서 끝나고, 끝은 곧다', () => {
    const points = wavePoints({ x: 0, y: 0 }, { x: 300, y: 0 }, 10, 60, 40)
    expect(points.slice(0, 2)).toEqual([0, 0])
    expect(points.slice(-2)).toEqual([300, 0])
    const ys = points.filter((_, i) => i % 2 === 1)
    expect(Math.max(...ys)).toBeCloseTo(10, 0)
    // 화살촉 자리(마지막 40px)에는 물결이 없다.
    const beforeHead = points.slice(-4, -2)
    expect(beforeHead[0]).toBeCloseTo(260)
    expect(beforeHead[1]).toBeCloseTo(0, 5)
  })

  it('짧게 끈 화살표 · 선 · 공간은 만들지 않는다', () => {
    const near = { x: 105, y: 100 }
    for (const tool of ['pass', 'run', 'curve', 'dribble', 'line', 'zone'] as const) expect(markFromDrag(tool, { x: 100, y: 100 }, near, SIZE, STYLE)).toBeNull()
  })

  it('끌어서 만든 화살표는 고른 색 · 굵기와 곡선 손잡이를 가진다', () => {
    const mark = markFromDrag('curve', { x: 0, y: 0 }, { x: 400, y: 0 }, SIZE, STYLE)
    expect(mark).toMatchObject({ kind: 'arrow', variant: 'curve', color: '#ffe14d', size: 2, mid: { x: 200, y: 72 } })
  })

  it('선수 원 · 조명은 누르기만 해도 기본 크기로 놓인다', () => {
    const ring = markFromDrag('ring', { x: 500, y: 600 }, { x: 500, y: 600 }, SIZE, STYLE)
    expect(ring).toMatchObject({ kind: 'ring', x: 500, y: 600, rx: 92 })
    expect(ring?.kind === 'ring' && ring.ry).toBeCloseTo(92 * 0.36)
    expect(markFromDrag('spot', { x: 10, y: 10 }, { x: 10, y: 10 }, SIZE, STYLE)).toMatchObject({ kind: 'spot', rx: 180, ry: 180 })
  })

  it('공간은 어느 쪽으로 끌어도 왼쪽 위를 기준으로 잡는다', () => {
    expect(markFromDrag('zone', { x: 300, y: 400 }, { x: 100, y: 100 }, SIZE, STYLE)).toMatchObject({ x: 100, y: 100, w: 200, h: 300 })
  })

  it('글자 · 번호는 끌기로 만들지 않는다 (누른 자리에 놓는다)', () => {
    expect(markFromDrag('text', { x: 0, y: 0 }, { x: 400, y: 400 }, SIZE, STYLE)).toBeNull()
    expect(markFromDrag('number', { x: 0, y: 0 }, { x: 400, y: 400 }, SIZE, STYLE)).toBeNull()
  })

  it('옮기면 화살표는 세 점이, 나머지는 기준점이 함께 움직인다', () => {
    const arrow: Mark = { id: 'a', kind: 'arrow', variant: 'curve', color: '#fff', size: 1, from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, mid: { x: 5, y: 5 } }
    expect(moveMark(arrow, 3, 4)).toMatchObject({ from: { x: 3, y: 4 }, to: { x: 13, y: 4 }, mid: { x: 8, y: 9 } })
    const text: Mark = { id: 't', kind: 'text', color: '#fff', x: 1, y: 1, text: 'A', fontSize: 20, boxed: true }
    expect(moveMark(text, 2, 2)).toMatchObject({ x: 3, y: 3 })
  })

  it('밝은 바탕에는 검은 글자, 어두운 바탕에는 흰 글자', () => {
    expect(inkOn('#ffe14d')).toBe('#111113')
    expect(inkOn('#ffffff')).toBe('#111113')
    expect(inkOn('#111113')).toBe('#ffffff')
    expect(inkOn('#ff4d5e')).toBe('#ffffff')
  })

  it('번호는 가장 큰 번호 다음부터 매긴다', () => {
    expect(nextNumber([])).toBe(1)
    const n = (value: number): Mark => ({ id: String(value), kind: 'number', color: '#fff', x: 0, y: 0, value, r: 10 })
    expect(nextNumber([n(1), n(4), n(2)])).toBe(5)
    expect(nextNumber([n(MARK_LIMITS.maxNumber)])).toBe(MARK_LIMITS.maxNumber)
  })
})

describe('되돌리기', () => {
  const m = (id: string): Mark => ({ id, kind: 'number', color: '#fff', x: 0, y: 0, value: 1, r: 10 })

  it('되돌리고 다시 할 수 있고, 새로 바꾸면 다시 하기가 사라진다', () => {
    let h = commit(emptyHistory(), [m('a')])
    h = commit(h, [m('a'), m('b')])
    h = undo(h)
    expect(h.present.map((x) => x.id)).toEqual(['a'])
    h = redo(h)
    expect(h.present.map((x) => x.id)).toEqual(['a', 'b'])
    h = undo(undo(h))
    expect(h.present).toEqual([])
    expect(undo(h)).toBe(h)
    h = commit(h, [m('c')])
    expect(h.future).toEqual([])
  })

  it('기록은 정해진 수까지만 남긴다', () => {
    let h = emptyHistory()
    for (let i = 0; i < MARK_LIMITS.history + 10; i++) h = commit(h, [m(String(i))])
    expect(h.past).toHaveLength(MARK_LIMITS.history)
  })
})
