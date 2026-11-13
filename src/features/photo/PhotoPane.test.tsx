import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useImperativeHandle, useState, type Ref } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mark, NewMark, Point, ToolId } from '@highpress/core/photo'
import { PhotoPane, type PhotoSession } from './PhotoPane'

// jsdom 에는 캔버스가 없어서 Konva 캔버스는 가짜로 바꾼다. 단추로 그리기 · 놓기 · 고르기를 흉내 낸다.
vi.mock('./PhotoCanvas', () => ({
  PhotoCanvas: (props: {
    ref?: Ref<{ toBlob: (type: string, quality?: number) => Promise<Blob> }>
    marks: Mark[]
    tool: ToolId
    style: { color: string; size: number }
    onCreate: (mark: NewMark) => void
    onPlace: (point: Point) => void
    onSelect: (id: string | null) => void
  }) => {
    useImperativeHandle(props.ref, () => ({ toBlob: async (type: string) => new Blob(['jpg'], { type }) }))
    return (
      <div>
        <span>표시 {props.marks.length}개</span>
        <button
          type="button"
          onClick={() =>
            props.onCreate({ kind: 'arrow', variant: 'pass', color: props.style.color, size: props.style.size as 1, from: { x: 10, y: 10 }, to: { x: 200, y: 120 }, mid: { x: 100, y: 80 } })
          }
        >
          가짜 화살표 긋기
        </button>
        <button type="button" onClick={() => props.onPlace({ x: 50, y: 60 })}>
          가짜 자리 누르기
        </button>
        <button type="button" onClick={() => props.marks[0] && props.onSelect(props.marks[0].id)}>
          가짜 첫 표시 고르기
        </button>
      </div>
    )
  },
}))

// 사진 읽기(createImageBitmap)도 jsdom 에 없다.
vi.mock('./collage', async (original) => ({
  ...(await original<typeof import('./collage')>()),
  loadSource: vi.fn(async (file: File) => ({ name: file.name, image: {} as CanvasImageSource, size: { width: 1600, height: 900 } })),
  paintBase: vi.fn(),
}))

function Harness({ onInsertFiles }: { onInsertFiles?: (files: File[]) => void }) {
  const [session, setSession] = useState<PhotoSession | null>(null)
  return <PhotoPane session={session} onSession={setSession} onInsertFiles={onInsertFiles} />
}

const jpg = (name = '경기.jpg') => new File(['x'], name, { type: 'image/jpeg' })

const openSingle = async () => {
  fireEvent.change(screen.getByLabelText(/사진 한 장 불러오기/), { target: { files: [jpg()] } })
  await screen.findByRole('toolbar', { name: '사진 도구' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('사진 탭', () => {
  it('처음에는 한 장 불러오기와 두 장 붙이기를 고른다', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: '경기 사진에 표시를 더합니다' })).toBeInTheDocument()
    expect(screen.getByLabelText(/사진 한 장 불러오기/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /두 장 붙이기/ })).toBeInTheDocument()
  })

  it('사진이 아닌 파일은 이유를 알려 준다', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/사진 한 장 불러오기/), { target: { files: [new File(['x'], 'a.heic', { type: 'image/heic' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPG, WebP, GIF')
  })

  it('한 장을 불러오면 축구 도구가 보이고, 화살표를 긋고 지우고 되돌린다', async () => {
    render(<Harness />)
    await openSingle()
    for (const name of ['패스', '움직임', '곡선 침투', '드리블', '선수 원', '조명', '공간', '글자', '번호']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByText('1600×900')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '가짜 화살표 긋기' }))
    expect(screen.getByText('표시 1개')).toBeInTheDocument()
    // 새로 그린 표시는 바로 골라져 지울 수 있다.
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(screen.getByText('표시 0개')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.getByText('표시 1개')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }))
    expect(screen.getByText('표시 0개')).toBeInTheDocument()
  })

  it('고른 색과 굵기로 그린다', async () => {
    render(<Harness />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '하늘' }))
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    fireEvent.click(screen.getByRole('button', { name: '가짜 화살표 긋기' }))
    expect(screen.getByRole('button', { name: '하늘' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '굵게' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('글자 도구로 누른 자리에 이름표를 놓고 내용을 고친다', async () => {
    render(<Harness />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '글자' }))
    fireEvent.click(screen.getByRole('button', { name: '가짜 자리 누르기' }))
    const input = screen.getByRole('textbox', { name: '글자' })
    expect(input).toHaveValue('선수 이름')
    fireEvent.change(input, { target: { value: '손흥민' } })
    expect(input).toHaveValue('손흥민')
    fireEvent.click(screen.getByRole('button', { name: '글자만' }))
    expect(screen.getByRole('button', { name: '글자만' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('번호 도구는 누를 때마다 다음 번호를 놓는다', async () => {
    render(<Harness />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '번호' }))
    fireEvent.click(screen.getByRole('button', { name: '가짜 자리 누르기' }))
    expect(screen.getByRole('spinbutton', { name: '번호' })).toHaveValue(1)
    fireEvent.click(screen.getByRole('button', { name: '가짜 자리 누르기' }))
    expect(screen.getByRole('spinbutton', { name: '번호' })).toHaveValue(2)
    expect(screen.getByText('표시 2개')).toBeInTheDocument()
  })

  it('Delete 키로 고른 표시를 지우고 Ctrl+Z 로 되돌린다', async () => {
    render(<Harness />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '가짜 화살표 긋기' }))
    const pane = screen.getByRole('toolbar', { name: '사진 도구' }).parentElement as HTMLElement
    fireEvent.keyDown(pane, { key: 'Delete' })
    expect(screen.getByText('표시 0개')).toBeInTheDocument()
    fireEvent.keyDown(pane, { key: 'z', ctrlKey: true })
    expect(screen.getByText('표시 1개')).toBeInTheDocument()
  })

  it('본문에 넣기를 누르면 그린 것까지 한 장의 JPG로 넘긴다', async () => {
    const onInsertFiles = vi.fn()
    render(<Harness onInsertFiles={onInsertFiles} />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '가짜 화살표 긋기' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))
    await waitFor(() => expect(onInsertFiles).toHaveBeenCalledTimes(1))
    const [file] = onInsertFiles.mock.calls[0][0] as File[]
    expect(file.name).toBe('경기-편집.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(await screen.findByRole('status')).toHaveTextContent('본문에 넣었습니다')
  })

  it('콜라주: 두 장을 넣어야 꾸미기를 시작하고, 배치와 순서를 바꿀 수 있다', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /두 장 붙이기/ }))
    const start = screen.getByRole('button', { name: '이 사진으로 꾸미기' })
    expect(start).toBeDisabled()
    expect(screen.getByText(/두 장을 모두 넣으면/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('왼쪽 사진 고르기'), { target: { files: [jpg('전반.jpg')] } })
    await screen.findByText('눌러서 바꾸기')
    expect(start).toBeDisabled()
    fireEvent.change(screen.getByLabelText('오른쪽 사진 고르기'), { target: { files: [jpg('후반.jpg')] } })
    await waitFor(() => expect(start).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: '위아래' }))
    expect(screen.getByLabelText('위 사진 고르기')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '순서 바꾸기' }))

    fireEvent.click(screen.getByRole('button', { name: '이 사진으로 꾸미기' }))
    expect(await screen.findByRole('toolbar', { name: '사진 도구' })).toBeInTheDocument()
    // 순서를 바꿨으므로 이름은 후반 사진에서 온다.
    expect(screen.getByText('후반-콜라주')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '콜라주 다시 맞추기' })).toBeInTheDocument()
  })

  it('왼쪽 사진을 읽는 동안 오른쪽을 넣어도 두 칸이 모두 남는다', async () => {
    const { loadSource } = await import('./collage')
    let finishLeft: () => void = () => {}
    vi.mocked(loadSource).mockImplementationOnce(
      (file: File) => new Promise((resolve) => (finishLeft = () => resolve({ name: file.name, image: {} as CanvasImageSource, size: { width: 800, height: 600 } }))),
    )
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /두 장 붙이기/ }))
    fireEvent.change(screen.getByLabelText('왼쪽 사진 고르기'), { target: { files: [jpg('느린.jpg')] } })
    fireEvent.change(screen.getByLabelText('오른쪽 사진 고르기'), { target: { files: [jpg('빠른.jpg')] } })
    await screen.findByText('눌러서 바꾸기')
    finishLeft()
    await waitFor(() => expect(screen.getAllByText('눌러서 바꾸기')).toHaveLength(2))
    expect(screen.getByRole('button', { name: '이 사진으로 꾸미기' })).toBeEnabled()
  })

  it('두 장을 함께 끌어 놓으면 콜라주 칸이 한 번에 채워진다', async () => {
    render(<Harness />)
    const zone = screen.getByRole('heading', { name: '경기 사진에 표시를 더합니다' }).parentElement as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [jpg('a.jpg'), jpg('b.jpg')], types: ['Files'] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '이 사진으로 꾸미기' })).toBeEnabled())
  })

  it('표시가 있을 때 닫으면 먼저 묻는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness />)
    await openSingle()
    fireEvent.click(screen.getByRole('button', { name: '가짜 화살표 긋기' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('toolbar', { name: '사진 도구' })).toBeInTheDocument()
    confirm.mockRestore()
  })
})
