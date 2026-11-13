import { describe, expect, it } from 'vitest'
import { BALL_ID, TACTIC_LIMITS, type Shape, type TacticProject } from '../db/types'
import { formationPositions } from './formations'
import {
  addScene as addSceneWith,
  addShape as addShapeWith,
  applyFormation,
  clearShapes,
  createDefaultProject as createDefaultProjectWith,
  DEFAULT_DURATION_MS,
  DEFAULT_TEAM_COLORS,
  deleteScene,
  deleteShape,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  moveShape,
  moveToken,
  normalizeProject,
  setPitchColor,
  setSceneDuration,
  setShapeColor,
  setTeamColor,
  setTokenColor,
  setTokenName,
} from './projectOps'

// id 를 만드는 함수는 밖에서 받는다. 시험에서는 차례 번호로 만든다.
let seq = 0
const newId = () => `id-${++seq}`
const createDefaultProject = (columnId: string) => createDefaultProjectWith(columnId, newId)
const addScene = (project: TacticProject, afterIndex: number) => addSceneWith(project, afterIndex, newId)
const addShape = (project: TacticProject, sceneIndex: number, shape: Omit<Shape, 'id'>) => addShapeWith(project, sceneIndex, shape, newId)

const arrow = (over: Partial<Omit<Shape, 'id'>> = {}): Omit<Shape, 'id'> => ({
  kind: 'arrow',
  dashed: true,
  color: '#ffe066',
  from: { x: 0.2, y: 0.2 },
  to: { x: 0.6, y: 0.5 },
  ...over,
})

describe('장면 = 한 번의 움직임 (시작 위치 → 도착 위치)', () => {
  const at = (x: number, y: number) => ({ x, y })

  it('새 프로젝트는 시작 위치와 도착 위치가 같다', () => {
    const [scene] = createDefaultProject('c').scenes
    expect(scene.start).toEqual(scene.positions)
    expect(scene.start).not.toBe(scene.positions)
  })

  it('첫 장면의 시작을 고치면 아직 움직이지 않은 선수의 도착도 따라가고, 이미 움직인 선수의 도착은 그대로다', () => {
    let project = moveToken(createDefaultProject('c'), 0, 'a9', at(0.9, 0.1), 'end')
    project = moveToken(project, 0, 'a1', at(0.2, 0.2), 'start')
    project = moveToken(project, 0, 'a9', at(0.3, 0.3), 'start')
    const [scene] = project.scenes
    expect(scene.start?.a1).toEqual(at(0.2, 0.2))
    expect(scene.positions.a1).toEqual(at(0.2, 0.2))
    expect(scene.start?.a9).toEqual(at(0.3, 0.3))
    expect(scene.positions.a9).toEqual(at(0.9, 0.1))
  })

  it('도착 위치를 고쳐도 시작 위치는 바뀌지 않는다', () => {
    const fresh = createDefaultProject('c')
    const moved = moveToken(fresh, 0, 'a1', at(0.7, 0.7))
    expect(moved.scenes[0].positions.a1).toEqual(at(0.7, 0.7))
    expect(moved.scenes[0].start).toEqual(fresh.scenes[0].start)
  })

  it('포메이션도 고치는 쪽(시작/도착)에 적용된다', () => {
    const fresh = createDefaultProject('c')
    const end = applyFormation(fresh, 0, 'a', '3-5-2', 'end')
    expect(end.scenes[0].start).toEqual(fresh.scenes[0].start)
    expect(end.scenes[0].positions.a2).toEqual(formationPositions('3-5-2', 'a')[1])

    const start = applyFormation(fresh, 0, 'a', '3-5-2', 'start')
    expect(start.scenes[0].start?.a2).toEqual(formationPositions('3-5-2', 'a')[1])
    // 아직 움직임이 없었으므로 도착도 같은 포메이션이 된다
    expect(start.scenes[0].positions.a2).toEqual(formationPositions('3-5-2', 'a')[1])
  })

  it('둘째 장면부터는 시작 위치를 따로 고칠 수 없다 (앞 장면의 도착 위치다)', () => {
    const project = addScene(createDefaultProject('c'), 0)
    expect(moveToken(project, 1, 'a1', at(0.5, 0.5), 'start')).toBe(project)
    expect(applyFormation(project, 1, 'a', '3-5-2', 'start')).toBe(project)
    expect(project.scenes[1].start).toBeUndefined()
  })

  it('첫 장면을 지우면 둘째 장면이 그 도착 위치를 시작 위치로 물려받아 움직임이 유지된다', () => {
    let project = moveToken(createDefaultProject('c'), 0, 'a1', at(0.3, 0.3))
    project = moveToken(addScene(project, 0), 1, 'a1', at(0.8, 0.8))
    const rest = deleteScene(project, 0)
    expect(rest.scenes).toHaveLength(1)
    expect(rest.scenes[0].start?.a1).toEqual(at(0.3, 0.3))
    expect(rest.scenes[0].positions.a1).toEqual(at(0.8, 0.8))
  })

  it('예전 방식(장면 = 한 순간)으로 저장된 프로젝트를 같은 애니메이션이 되도록 바꾼다', () => {
    const fresh = createDefaultProject('c')
    const shape = (id: string): Shape => ({ id, kind: 'line', dashed: false, color: '#000000', from: at(0, 0), to: at(1, 1) })
    const key = (id: string, x: number, durationMs: number, shapes: Shape[]) => ({
      id,
      positions: { a1: at(x, 0.5), [BALL_ID]: at(0.5, 0.5) },
      durationMs,
      shapes,
    })
    // 예전: 세 순간 k1 → k2 → k3, 그 사이를 이동 (k2까지 2초, k3까지 3초)
    const legacy = { ...fresh, scenes: [key('k1', 0.1, 999, [shape('s1')]), key('k2', 0.5, 2000, [shape('s2')]), key('k3', 0.9, 3000, [shape('s3')])] }
    const { scenes } = normalizeProject(legacy)

    expect(scenes.map((scene) => scene.id)).toEqual(['k2', 'k3'])
    expect(scenes[0].start?.a1).toEqual(at(0.1, 0.5))
    expect(scenes.map((scene) => scene.positions.a1)).toEqual([at(0.5, 0.5), at(0.9, 0.5)])
    expect(scenes.map((scene) => scene.durationMs)).toEqual([2000, 3000])
    expect(scenes[1].start).toBeUndefined()
    // 도형: 떠나는 동안 보이던 것이 그 이동 장면으로, 마지막 순간의 것은 마지막 이동에 합쳐진다
    expect(scenes.map((scene) => scene.shapes?.map((s) => s.id))).toEqual([['s1'], ['s2', 's3']])
    // 다시 열어도 또 바뀌지 않는다
    const converted = { ...legacy, scenes }
    expect(normalizeProject(converted)).toBe(converted)
  })

  it('예전 방식의 한 장면짜리 프로젝트는 제자리에 머무는 장면 하나가 된다', () => {
    const fresh = createDefaultProject('c')
    const { start: _start, ...only } = fresh.scenes[0]
    const { scenes } = normalizeProject({ ...fresh, scenes: [only] })
    expect(scenes).toHaveLength(1)
    expect(scenes[0].start).toEqual(scenes[0].positions)
  })
})

describe('공·이름·색·도형', () => {
  it('공은 선수처럼 장면마다 옮길 수 있고 경기장 안에 머문다', () => {
    const project = moveToken(createDefaultProject('c'), 0, BALL_ID, { x: 1.4, y: 0.25 })
    expect(project.scenes[0].positions[BALL_ID]).toEqual({ x: 1, y: 0.25 })
    expect(moveToken(project, 0, 'nobody', { x: 0, y: 0 })).toBe(project)
  })

  it('공이 없던 예전 프로젝트를 열면 모든 장면 가운데에 공이 놓인다', () => {
    const fresh = createDefaultProject('c')
    const { [BALL_ID]: _ball, ...players } = fresh.scenes[0].positions
    const legacy = addScene({ ...fresh, scenes: [{ ...fresh.scenes[0], positions: players }] }, 0)
    const opened = normalizeProject(legacy)
    expect(opened.scenes.map((scene) => scene.positions[BALL_ID])).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ])
    expect(opened.scenes[0].positions.a1).toEqual(fresh.scenes[0].positions.a1)
    // 이미 공이 있으면 그대로 돌려준다
    expect(normalizeProject(fresh)).toBe(fresh)
  })

  it('선수 이름은 길이 한도로 자르고, 비우면 지운다', () => {
    const named = setTokenName(createDefaultProject('c'), 'a9', '손흥민'.repeat(10))
    expect(named.tokens.find((t) => t.id === 'a9')?.name).toHaveLength(TACTIC_LIMITS.maxNameLength)
    expect(named.tokens.find((t) => t.id === 'a8')?.name).toBeUndefined()
    const cleared = setTokenName(named, 'a9', '')
    expect(cleared.tokens.find((t) => t.id === 'a9')).toEqual({ id: 'a9', team: 'a' })
  })

  it('배경색·팀 색·선수 개별 색을 바꾸고, 잘못된 색은 무시한다', () => {
    let project = createDefaultProject('c')
    project = setPitchColor(project, '#2f9e44')
    project = setTeamColor(project, 'b', '#111111')
    project = setTokenColor(project, 'a1', '#ffd43b')
    expect(project.pitchColor).toBe('#2f9e44')
    expect(project.teamColors).toEqual({ a: DEFAULT_TEAM_COLORS.a, b: '#111111' })
    expect(project.tokens.find((t) => t.id === 'a1')?.color).toBe('#ffd43b')

    expect(setPitchColor(project, 'red')).toBe(project)
    expect(setTeamColor(project, 'a', 'javascript:1')).toBe(project)
    expect(setTokenColor(project, 'a1', '#fff')).toBe(project)
    // null이면 팀 색으로 돌아간다
    expect(setTokenColor(project, 'a1', null).tokens.find((t) => t.id === 'a1')).toEqual({ id: 'a1', team: 'a' })
  })

  it('도형은 그 장면에만 추가되고, 새 장면으로 복사되지 않는다', () => {
    let project = addScene(createDefaultProject('c'), 0)
    project = addShape(project, 0, arrow())
    project = addShape(project, 0, arrow({ kind: 'ellipse', dashed: false, to: { x: 3, y: -1 } }))
    expect(project.scenes[0].shapes).toHaveLength(2)
    expect(project.scenes[0].shapes?.[0]).toMatchObject({ kind: 'arrow', dashed: true, color: '#ffe066' })
    expect(project.scenes[0].shapes?.[1].to).toEqual({ x: 1, y: 0 })
    expect(project.scenes[1].shapes).toEqual([])
    expect(addScene(project, 0).scenes[1].shapes).toEqual([])
    expect(addShape(project, 0, arrow({ color: 'red' }))).toBe(project)
  })

  it('장면 하나의 도형 수는 한도를 넘지 않는다', () => {
    let project = createDefaultProject('c')
    for (let i = 0; i < TACTIC_LIMITS.maxShapes + 5; i++) project = addShape(project, 0, arrow())
    expect(project.scenes[0].shapes).toHaveLength(TACTIC_LIMITS.maxShapes)
  })

  it('도형을 옮기면 양 끝이 함께 움직이되 경기장을 벗어나지 않는다', () => {
    const project = addShape(createDefaultProject('c'), 0, arrow())
    const id = project.scenes[0].shapes![0].id
    const moved = moveShape(project, 0, id, 0.1, 0.2).scenes[0].shapes![0]
    expect(moved.from.x).toBeCloseTo(0.3)
    expect(moved.from.y).toBeCloseTo(0.4)
    expect(moved.to.x).toBeCloseTo(0.7)
    expect(moved.to.y).toBeCloseTo(0.7)

    const pushed = moveShape(project, 0, id, 5, -5).scenes[0].shapes![0]
    expect(pushed.to.x).toBeCloseTo(1)
    expect(pushed.from.x).toBeCloseTo(0.6)
    expect(pushed.from.y).toBeCloseTo(0)
    expect(pushed.to.y).toBeCloseTo(0.3)
    expect(moveShape(project, 0, id, Number.NaN, 0)).toBe(project)
  })

  it('도형 색 바꾸기, 하나 삭제, 모두 지우기', () => {
    let project = addShape(addShape(createDefaultProject('c'), 0, arrow()), 0, arrow({ kind: 'line' }))
    const [first, second] = project.scenes[0].shapes!
    project = setShapeColor(project, 0, first.id, '#ff0000')
    expect(project.scenes[0].shapes?.[0].color).toBe('#ff0000')
    expect(project.scenes[0].shapes?.[1].color).toBe('#ffe066')
    project = deleteShape(project, 0, first.id)
    expect(project.scenes[0].shapes?.map((s) => s.id)).toEqual([second.id])
    project = clearShapes(project, 0)
    expect(project.scenes[0].shapes).toEqual([])
    expect(clearShapes(project, 0)).toBe(project)
  })
})

describe('projectOps', () => {
  it('기본 프로젝트: 장면 1개, 팀 A 4-3-3 대 팀 B 4-4-2, 11명씩', () => {
    const project = createDefaultProject('col-1')
    expect(project.columnId).toBe('col-1')
    expect(project.teamColors).toEqual(DEFAULT_TEAM_COLORS)
    expect(project.tokens.filter((t) => t.team === 'a')).toHaveLength(11)
    expect(project.tokens.filter((t) => t.team === 'b')).toHaveLength(11)
    expect(new Set(project.tokens.map((t) => t.id)).size).toBe(22)
    expect(project.scenes).toHaveLength(1)
    expect(project.scenes[0].durationMs).toBe(DEFAULT_DURATION_MS)
    const { positions } = project.scenes[0]
    // 선수 22명 + 가운데에 놓인 공
    expect(Object.keys(positions)).toHaveLength(23)
    expect(positions[BALL_ID]).toEqual({ x: 0.5, y: 0.5 })
    expect(project.tokens.filter((t) => t.team === 'a').map((t) => positions[t.id])).toEqual(
      formationPositions('4-3-3', 'a'),
    )
    expect(project.tokens.filter((t) => t.team === 'b').map((t) => positions[t.id])).toEqual(
      formationPositions('4-4-2', 'b'),
    )
  })

  it('장면 추가는 현재 장면의 위치를 복사해 바로 뒤에 넣는다', () => {
    const base = moveToken(createDefaultProject('c'), 0, 'a1', { x: 0.3, y: 0.3 })
    const next = addScene(base, 0)
    expect(next.scenes).toHaveLength(2)
    expect(next.scenes[1].id).not.toBe(next.scenes[0].id)
    expect(next.scenes[1].positions).toEqual(base.scenes[0].positions)
    expect(next.scenes[1].positions).not.toBe(base.scenes[0].positions)
    expect(next.scenes[1].durationMs).toBe(DEFAULT_DURATION_MS)
    expect(base.scenes).toHaveLength(1)

    const middle = addScene(moveToken(next, 0, 'a1', { x: 0.1, y: 0.1 }), 0)
    expect(middle.scenes).toHaveLength(3)
    expect(middle.scenes[1].positions.a1).toEqual({ x: 0.1, y: 0.1 })
    expect(middle.scenes[2].id).toBe(next.scenes[1].id)
    expect(addScene(base, 7)).toBe(base)

    let full = base
    for (let i = 0; i < 60; i++) full = addScene(full, 0)
    expect(full.scenes).toHaveLength(50)
  })

  it('장면 삭제는 최소 한 장면을 남긴다', () => {
    const one = createDefaultProject('c')
    expect(deleteScene(one, 0)).toBe(one)
    const two = addScene(one, 0)
    const after = deleteScene(two, 0)
    expect(after.scenes).toHaveLength(1)
    expect(after.scenes[0].id).toBe(two.scenes[1].id)
    expect(deleteScene(two, 5)).toBe(two)
  })

  it('토큰 이동은 현재 장면의 그 토큰만 바꾸고 경기장 안으로 제한한다', () => {
    const base = addScene(createDefaultProject('c'), 0)
    const moved = moveToken(base, 1, 'b3', { x: 1.4, y: -0.2 })
    expect(moved.scenes[1].positions.b3).toEqual({ x: 1, y: 0 })
    expect(moved.scenes[0]).toBe(base.scenes[0])
    const { b3: _moved, ...others } = moved.scenes[1].positions
    const { b3: _original, ...originalOthers } = base.scenes[1].positions
    expect(others).toEqual(originalOthers)
    expect(moveToken(base, 0, '없는-토큰', { x: 0.5, y: 0.5 })).toBe(base)
    expect(moveToken(base, 9, 'a1', { x: 0.5, y: 0.5 })).toBe(base)
  })

  it('이동 시간은 0.3~5초로 제한된다', () => {
    const base = addScene(createDefaultProject('c'), 0)
    expect(setSceneDuration(base, 1, 2400).scenes[1].durationMs).toBe(2400)
    expect(setSceneDuration(base, 1, 10).scenes[1].durationMs).toBe(MIN_DURATION_MS)
    expect(setSceneDuration(base, 1, 99999).scenes[1].durationMs).toBe(MAX_DURATION_MS)
    expect(setSceneDuration(base, 1, Number.NaN)).toBe(base)
    expect(setSceneDuration(base, 1, 2400).scenes[0]).toBe(base.scenes[0])
  })

  it('포메이션은 고른 팀의 현재 장면에만 적용된다', () => {
    const base = addScene(createDefaultProject('c'), 0)
    const next = applyFormation(base, 1, 'a', '3-5-2')
    const teamA = base.tokens.filter((t) => t.team === 'a')
    const teamB = base.tokens.filter((t) => t.team === 'b')
    expect(teamA.map((t) => next.scenes[1].positions[t.id])).toEqual(formationPositions('3-5-2', 'a'))
    for (const token of teamB) expect(next.scenes[1].positions[token.id]).toBe(base.scenes[1].positions[token.id])
    expect(next.scenes[0]).toBe(base.scenes[0])

    const mirrored = applyFormation(base, 0, 'b', '4-2-3-1')
    expect(teamB.map((t) => mirrored.scenes[0].positions[t.id])).toEqual(formationPositions('4-2-3-1', 'b'))
    for (const token of teamA) expect(mirrored.scenes[0].positions[token.id]).toBe(base.scenes[0].positions[token.id])
  })
})
