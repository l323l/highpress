import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, newId } from '../../db/db'
import type { Point, TacticProject } from '@highpress/core/db'
import { TACTIC_DRAG_MIME } from '@highpress/core/body'
import { TooManyFramesError, addScene } from '@highpress/core/tactics'
import { renderTactic } from './export/renderTactic'
import { TacticsPane } from './TacticsPane'

// jsdom에는 캔버스가 없어서 react-konva 전술판은 가짜로 바꾼다. 누르면 a1 토큰을 옮긴 것으로 친다.
vi.mock('./Board', () => ({
  Board: (props: {
    draggable: boolean
    tool: { kind: string; dashed: boolean } | null
    shapeColor: string
    positions: Record<string, Point>
    ghost?: Record<string, Point>
    shapes: { id: string }[]
    onMoveToken: (id: string, point: Point) => void
    onSelect: (selection: { type: 'token' | 'shape'; id: string } | null) => void
    onAddShape: (shape: object) => void
    onMoveShape: (id: string, dx: number, dy: number) => void
  }) => (
    <div>
      <button type="button" disabled={!props.draggable} onClick={() => props.onMoveToken('a1', { x: 0.9, y: 2 })}>
        가짜 전술판
      </button>
      <button type="button" onClick={() => props.onMoveToken('ball', { x: 0.25, y: 0.75 })}>
        가짜 공 옮기기
      </button>
      <button type="button" onClick={() => props.onSelect({ type: 'token', id: 'a9' })}>
        가짜 선수 고르기
      </button>
      <button
        type="button"
        onClick={() => props.tool && props.onAddShape({ ...props.tool, color: props.shapeColor, from: { x: 0.1, y: 0.1 }, to: { x: 0.4, y: 0.3 } })}
      >
        가짜 도형 그리기
      </button>
      <button type="button" onClick={() => props.shapes[0] && props.onSelect({ type: 'shape', id: props.shapes[0].id })}>
        가짜 도형 고르기
      </button>
      <span data-testid="board-shapes">{props.shapes.length}</span>
      <span data-testid="board-a1">{JSON.stringify(props.positions.a1)}</span>
      <span data-testid="board-ghost">{props.ghost ? '있음' : '없음'}</span>
    </div>
  ),
}))

vi.mock('./export/renderTactic', () => ({ renderTactic: vi.fn() }))

const MOVED = { x: 0.9, y: 1 }

async function stored(columnId = 'col'): Promise<TacticProject> {
  const project = await db.tacticProjects.where('columnId').equals(columnId).first()
  if (!project) throw new Error('저장된 프로젝트가 없습니다')
  return project
}

async function renderPane(onInsert?: Parameters<typeof TacticsPane>[0]['onInsert']) {
  const view = render(<TacticsPane columnId="col" onInsert={onInsert} />)
  await screen.findByText('PNG 끌어다 넣기')
  return view
}

beforeEach(() => {
  vi.mocked(renderTactic).mockReset()
})

describe('TacticsPane', () => {
  it('프로젝트가 없으면 기본값을 만들어 저장하고, 있으면 그것을 불러온다', async () => {
    const first = await renderPane()
    const created = await stored()
    expect(created.scenes).toHaveLength(1)
    expect(created.tokens).toHaveLength(22)
    first.unmount()

    await renderPane()
    expect(await db.tacticProjects.count()).toBe(1)
    expect((await stored()).id).toBe(created.id)
  })

  it('끌기 칩은 올바른 payload를 싣고, 그 직전 변경까지 IndexedDB에 들어간다', async () => {
    await renderPane()
    fireEvent.click(screen.getByText('가짜 전술판'))

    const dataTransfer = { setData: vi.fn(), effectAllowed: 'none' }
    fireEvent.dragStart(screen.getByText('GIF 끌어다 넣기'), { dataTransfer })

    // 디바운스 저장을 기다리지 않고 곧바로 읽어도 방금 옮긴 위치가 보여야 한다.
    const project = await stored()
    expect(project.scenes[0].positions.a1).toEqual(MOVED)
    expect(dataTransfer.setData).toHaveBeenCalledExactlyOnceWith(
      TACTIC_DRAG_MIME,
      JSON.stringify({ projectId: project.id, format: 'gif' }),
    )
    expect(dataTransfer.effectAllowed).toBe('copy')

    fireEvent.dragStart(screen.getByText('PNG 끌어다 넣기'), { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenLastCalledWith(
      TACTIC_DRAG_MIME,
      JSON.stringify({ projectId: project.id, format: 'png', sceneIndex: 0 }),
    )
  })

  it('PNG는 지금 고른 장면 번호를 싣고, GIF는 싣지 않는다', async () => {
    const onInsert = vi.fn()
    await renderPane(onInsert)
    fireEvent.click(screen.getByRole('button', { name: '장면 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '장면 추가' }))
    expect(screen.getByRole('button', { name: '장면 3' })).toHaveAttribute('aria-pressed', 'true')
    const projectId = (await stored()).id

    const dataTransfer = { setData: vi.fn() }
    fireEvent.dragStart(screen.getByText('PNG 끌어다 넣기'), { dataTransfer })
    expect(JSON.parse(dataTransfer.setData.mock.calls[0][1])).toEqual({ projectId, format: 'png', sceneIndex: 2 })
    fireEvent.dragStart(screen.getByText('GIF 끌어다 넣기'), { dataTransfer })
    expect(JSON.parse(dataTransfer.setData.mock.calls[1][1])).toEqual({ projectId, format: 'gif' })

    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (PNG)' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (GIF)' }))
    await waitFor(() => expect(onInsert).toHaveBeenCalledTimes(2))
    expect(onInsert).toHaveBeenCalledWith({ projectId, format: 'png', sceneIndex: 2 })
    expect(onInsert).toHaveBeenCalledWith({ projectId, format: 'gif' })

    fireEvent.click(screen.getByRole('button', { name: '장면 2' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (PNG)' }))
    await waitFor(() => expect(onInsert).toHaveBeenLastCalledWith({ projectId, format: 'png', sceneIndex: 1 }))
  })

  it.each([
    ['visibilitychange(hidden)', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['pagehide', () => window.dispatchEvent(new Event('pagehide'))],
  ])('%s 때 곧바로 저장한다', async (_name, leave) => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await renderPane()
    fireEvent.click(screen.getByText('가짜 전술판'))
    leave()
    expect((await stored()).scenes[0].positions.a1).toEqual(MOVED)
    visibility.mockRestore()
  })

  it('화면이 보이는 상태의 visibilitychange에는 저장을 앞당기지 않는다', async () => {
    await renderPane()
    fireEvent.click(screen.getByText('가짜 전술판'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect((await stored()).scenes[0].positions.a1).not.toEqual(MOVED)
  })

  it('저장에 실패하면 오류를 보여 주고 본문에 넣지 않으며, 다시 성공하면 오류가 사라진다', async () => {
    const onInsert = vi.fn()
    await renderPane(onInsert)
    const put = vi.spyOn(db.tacticProjects, 'where').mockImplementation(() => {
      throw new Error('quota')
    })
    fireEvent.click(screen.getByText('가짜 전술판'))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (GIF)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('전술판을 저장하지 못했습니다')
    expect(onInsert).not.toHaveBeenCalled()

    put.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (GIF)' }))
    await waitFor(() => expect(onInsert).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await stored()).scenes[0].positions.a1).toEqual(MOVED)
  })

  it('칼럼이 삭제되어 프로젝트가 사라졌으면 떠날 때 다시 만들지 않는다', async () => {
    const view = await renderPane()
    fireEvent.click(screen.getByText('가짜 전술판'))
    await db.tacticProjects.where('columnId').equals('col').delete()
    view.unmount()
    await db.tacticProjects.count()
    expect(await db.tacticProjects.count()).toBe(0)
  })

  it('본문에 넣기는 저장을 마친 뒤 onInsert를 부른다', async () => {
    const seen: (Point | undefined)[] = []
    const onInsert = vi.fn(async () => {
      seen.push((await stored()).scenes[0].positions.a1)
    })
    await renderPane(onInsert)
    fireEvent.click(screen.getByText('가짜 전술판'))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (PNG)' }))

    await waitFor(() => expect(seen).toEqual([MOVED]))
    expect(onInsert).toHaveBeenCalledExactlyOnceWith({ projectId: (await stored()).id, format: 'png', sceneIndex: 0 })
  })

  it('onInsert가 없으면 본문에 넣기 버튼을 보이지 않는다', async () => {
    await renderPane()
    expect(screen.queryByRole('button', { name: /본문에 넣기/ })).toBeNull()
  })

  it('변경은 1초 안에 저장되고, 화면을 떠날 때도 저장된다', async () => {
    const view = await renderPane()
    fireEvent.click(screen.getByText('가짜 전술판'))
    await waitFor(async () => expect((await stored()).scenes[0].positions.a1).toEqual(MOVED), { timeout: 1000 })

    fireEvent.change(screen.getByRole('combobox', { name: '팀 B 포메이션' }), { target: { value: '3-4-3' } })
    view.unmount()
    const project = await stored()
    expect(project.scenes[0].positions.b2.x).toBeCloseTo(0.86)
    expect(project.scenes[0].positions.a1).toEqual(MOVED)
  })

  it('장면 추가·선택·삭제와 이동 시간 조절', async () => {
    await renderPane()
    const remove = screen.getByRole('button', { name: '장면 삭제' })
    const slider = screen.getByRole('slider', { name: /이동 시간/ })
    expect(remove).toBeDisabled()
    // 첫 장면도 움직임이므로 이동 시간을 정할 수 있다
    expect(slider).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '장면 추가' }))
    expect(screen.getByRole('button', { name: '장면 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(slider).toBeEnabled()
    fireEvent.change(slider, { target: { value: '2.5' } })
    expect(screen.getByText('2.5초')).toBeInTheDocument()

    // 둘째 장면에서만 토큰을 옮긴다
    fireEvent.click(screen.getByText('가짜 전술판'))
    fireEvent.dragStart(screen.getByText('PNG 끌어다 넣기'), { dataTransfer: { setData: vi.fn() } })
    const project = await stored()
    expect(project.scenes).toHaveLength(2)
    expect(project.scenes[1].durationMs).toBe(2500)
    expect(project.scenes[1].positions.a1).toEqual(MOVED)
    expect(project.scenes[0].positions.a1).not.toEqual(MOVED)

    fireEvent.click(remove)
    expect(screen.queryByRole('button', { name: '장면 2' })).toBeNull()
    expect(screen.getByRole('button', { name: '장면 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(remove).toBeDisabled()
  })

  it('장면이 한도(50개)에 이르면 장면 추가를 막는다', async () => {
    const first = await renderPane()
    first.unmount()
    let project = await stored()
    while (project.scenes.length < 49) project = addScene(project, 0, newId)
    await db.tacticProjects.put(project)

    await renderPane()
    const add = screen.getByRole('button', { name: '장면 추가' })
    expect(add).toBeEnabled()
    fireEvent.click(add)
    expect(screen.getByRole('button', { name: '장면 50' })).toBeInTheDocument()
    expect(add).toBeDisabled()
  })

  it('재생 중에는 토큰을 끌 수 없고, 정지하면 다시 끌 수 있다', async () => {
    await renderPane()
    // 재생 버튼은 두 가지: 지금 장면만, 또는 전체
    for (const name of ['장면 재생', '전체 재생']) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(screen.getByText('가짜 전술판')).toBeDisabled()
      expect(screen.getByRole('button', { name: '장면 추가' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: '장면 재생' })).toBeNull()
      expect(screen.queryByRole('button', { name: '전체 재생' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '정지' }))
      expect(screen.getByText('가짜 전술판')).toBeEnabled()
    }
    expect(screen.getByRole('button', { name: '장면 재생' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체 재생' })).toBeInTheDocument()
  })

  it('첫 장면: 시작 위치를 고치면 아직 움직이지 않은 선수의 도착 위치도 따라가고, 도착 위치만 고치면 움직임이 생긴다', async () => {
    const view = await renderPane()
    expect(screen.getByRole('button', { name: '시작 위치' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('board-ghost')).toHaveTextContent('없음')

    // 시작 위치에서 a1을 옮긴다 → 시작과 도착이 함께 바뀐다 (아직 움직임 없음)
    fireEvent.click(screen.getByText('가짜 전술판'))
    fireEvent.click(screen.getByRole('button', { name: '도착 위치' }))
    expect(screen.getByTestId('board-ghost')).toHaveTextContent('있음')
    // 도착 위치에서 공을 옮긴다 → 공만 움직이는 장면이 된다
    fireEvent.click(screen.getByText('가짜 공 옮기기'))
    view.unmount()

    const [scene] = (await stored()).scenes
    expect(scene.start?.a1).toEqual(MOVED)
    expect(scene.positions.a1).toEqual(MOVED)
    expect(scene.start?.ball).toEqual({ x: 0.5, y: 0.5 })
    expect(scene.positions.ball).toEqual({ x: 0.25, y: 0.75 })
  })

  it('둘째 장면은 첫 장면의 도착 위치에서 이어지고, 그 시작 위치는 보기만 한다', async () => {
    const view = await renderPane()
    fireEvent.click(screen.getByRole('button', { name: '도착 위치' }))
    fireEvent.click(screen.getByText('가짜 전술판'))

    fireEvent.click(screen.getByRole('button', { name: '장면 추가' }))
    // 새 장면은 도착 위치를 만들 차례로 열리고, 앞 장면의 끝(a1 = MOVED)에서 시작한다
    expect(screen.getByRole('button', { name: '도착 위치' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('board-a1')).toHaveTextContent(JSON.stringify(MOVED))

    fireEvent.click(screen.getByRole('button', { name: '시작 위치' }))
    expect(screen.getByText('앞 장면의 도착 위치에서 이어집니다 (앞 장면에서 고칩니다).')).toBeInTheDocument()
    expect(screen.getByText('가짜 전술판')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '팀 A 포메이션' })).toBeDisabled()
    expect(screen.getByTestId('board-a1')).toHaveTextContent(JSON.stringify(MOVED))

    // 둘째 장면에서 공을 옮기면 둘째 장면의 도착 위치만 바뀐다
    fireEvent.click(screen.getByRole('button', { name: '도착 위치' }))
    fireEvent.click(screen.getByText('가짜 공 옮기기'))
    view.unmount()
    const project = await stored()
    expect(project.scenes[1].start).toBeUndefined()
    expect(project.scenes[0].positions.ball).toEqual({ x: 0.5, y: 0.5 })
    expect(project.scenes[1].positions.ball).toEqual({ x: 0.25, y: 0.75 })
  })

  it('공을 옮기면 그 장면에 저장된다', async () => {
    const view = await renderPane()
    expect((await stored()).scenes[0].positions.ball).toEqual({ x: 0.5, y: 0.5 })
    fireEvent.click(screen.getByText('가짜 공 옮기기'))
    view.unmount()
    expect((await stored()).scenes[0].positions.ball).toEqual({ x: 0.25, y: 0.75 })
  })

  it('선수를 고르면 이름과 색을 바꿀 수 있고, 팀 색으로 되돌릴 수 있다', async () => {
    const view = await renderPane()
    // 선수를 고르기 전에는 칸이 꺼져 있다
    expect(screen.getByLabelText('선수 이름')).toBeDisabled()
    expect(screen.getByLabelText('선수 색')).toBeDisabled()
    fireEvent.click(screen.getByText('가짜 선수 고르기'))
    expect(screen.getByLabelText('선수 이름')).toBeEnabled()

    fireEvent.change(screen.getByLabelText('선수 이름'), { target: { value: '손흥민' } })
    fireEvent.change(screen.getByLabelText('선수 색'), { target: { value: '#ffd43b' } })
    expect(screen.getByLabelText('선수 이름')).toHaveValue('손흥민')
    const reset = screen.getByRole('button', { name: '팀 색으로' })
    expect(reset).toBeEnabled()
    fireEvent.dragStart(screen.getByText('PNG 끌어다 넣기'), { dataTransfer: { setData: vi.fn() } })
    expect((await stored()).tokens.find((t) => t.id === 'a9')).toEqual({ id: 'a9', team: 'a', name: '손흥민', color: '#ffd43b' })

    fireEvent.click(reset)
    view.unmount()
    expect((await stored()).tokens.find((t) => t.id === 'a9')).toEqual({ id: 'a9', team: 'a', name: '손흥민' })
  })

  it('배경색과 팀 색을 바꾸면 저장된다', async () => {
    const view = await renderPane()
    fireEvent.change(screen.getByLabelText('배경색'), { target: { value: '#2f9e44' } })
    fireEvent.change(screen.getByLabelText('팀 B 색'), { target: { value: '#111111' } })
    view.unmount()
    const project = await stored()
    expect(project.pitchColor).toBe('#2f9e44')
    expect(project.teamColors.b).toBe('#111111')
  })

  it('도형 도구로 그리면 현재 장면에 들어가고 이동 도구로 돌아온다. 고른 도형은 색을 바꾸거나 지울 수 있다', async () => {
    const view = await renderPane()
    const move = screen.getByRole('button', { name: '이동' })
    const dashedArrow = screen.getByRole('button', { name: '⇢ 점선 화살표' })
    const remove = screen.getByRole('button', { name: '선택한 도형 삭제' })
    expect(move).toHaveAttribute('aria-pressed', 'true')
    expect(remove).toBeDisabled()
    expect(screen.getByRole('button', { name: '도형 모두 지우기' })).toBeDisabled()

    // 이동 도구에서는 그려지지 않는다
    fireEvent.click(screen.getByText('가짜 도형 그리기'))
    expect(screen.getByTestId('board-shapes')).toHaveTextContent('0')

    fireEvent.click(dashedArrow)
    expect(dashedArrow).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('전술판 위에서 끌어서 그립니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('가짜 도형 그리기'))
    expect(screen.getByTestId('board-shapes')).toHaveTextContent('1')
    expect(move).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByText('가짜 도형 고르기'))
    expect(remove).toBeEnabled()
    fireEvent.change(screen.getByLabelText('도형 색'), { target: { value: '#ff0000' } })
    fireEvent.dragStart(screen.getByText('PNG 끌어다 넣기'), { dataTransfer: { setData: vi.fn() } })
    expect((await stored()).scenes[0].shapes).toEqual([
      expect.objectContaining({ kind: 'arrow', dashed: true, color: '#ff0000', from: { x: 0.1, y: 0.1 }, to: { x: 0.4, y: 0.3 } }),
    ])

    // 다른 장면에는 보이지 않는다
    fireEvent.click(screen.getByRole('button', { name: '장면 추가' }))
    expect(screen.getByTestId('board-shapes')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('button', { name: '장면 1' }))
    expect(screen.getByTestId('board-shapes')).toHaveTextContent('1')

    fireEvent.click(screen.getByText('가짜 도형 고르기'))
    fireEvent.click(remove)
    expect(screen.getByTestId('board-shapes')).toHaveTextContent('0')
    view.unmount()
    expect((await stored()).scenes[0].shapes).toEqual([])
  })

  it('WebCodecs가 없으면 MP4 버튼을 막고 안내를 보여 준다', async () => {
    await renderPane()
    expect(
      await screen.findByText('이 브라우저는 MP4 내보내기를 지원하지 않습니다 (GIF·PNG 사용)'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MP4 내려받기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'GIF 내려받기' })).toBeEnabled()
  })

  it('내려받기: 성공하면 파일을 내려 주고, 실패하면 한국어 오류를 보여 준다', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await renderPane()

    const blob = new Blob(['x'], { type: 'image/png' })
    vi.mocked(renderTactic).mockResolvedValueOnce(blob)
    fireEvent.click(screen.getByRole('button', { name: 'PNG 내려받기' }))
    expect(await screen.findByRole('status')).toHaveTextContent('PNG 만드는 중')
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(vi.mocked(renderTactic).mock.calls[0][1]).toBe('png')
    expect(vi.mocked(renderTactic).mock.calls[0][2]).toMatchObject({ sceneIndex: 0 })

    vi.mocked(renderTactic).mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(screen.getByRole('button', { name: 'GIF 내려받기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('GIF 내보내기에 실패했습니다')
    expect(click).toHaveBeenCalledOnce()

    vi.mocked(renderTactic).mockRejectedValueOnce(new TooManyFramesError())
    fireEvent.click(screen.getByRole('button', { name: 'GIF 내려받기' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('애니메이션이 너무 길어'))
    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
