import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '../../lib/download'
import { ExportCancelled, exportGif, exportMp4, probeVideo } from './videoExport'
import { VideoPane, type VideoSession } from './VideoPane'

// jsdom에는 WebCodecs가 없어서 영상 처리는 가짜로 바꾼다. 실제 처리는 브라우저에서 확인한다.
vi.mock('./videoExport', () => ({
  ExportCancelled: class ExportCancelled extends Error {},
  probeVideo: vi.fn(),
  exportMp4: vi.fn(),
  exportGif: vi.fn(),
}))
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }))

const INFO = { duration: 60, width: 1920, height: 1080, hasAudio: true }
const onInsertFiles = vi.fn()

function Harness({ initial = null }: { initial?: VideoSession | null }) {
  const [session, setSession] = useState<VideoSession | null>(initial)
  return <VideoPane session={session} onSession={setSession} onInsertFiles={onInsertFiles} />
}

const videoFile = (name = '경기.mp4', type = 'video/mp4') => new File(['x'], name, { type })

async function load(file = videoFile()) {
  render(<Harness />)
  fireEvent.change(screen.getByLabelText('영상 파일 불러오기'), { target: { files: [file] } })
  await screen.findByLabelText('영상 미리보기')
}

const slide = (label: string, value: number) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(probeVideo).mockResolvedValue(INFO)
  vi.mocked(exportMp4).mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }))
  vi.mocked(exportGif).mockResolvedValue(new Blob(['gif'], { type: 'image/gif' }))
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
})

describe('영상 불러오기 (V-1)', () => {
  it('영상을 고르면 미리보기와 정보가 보인다', async () => {
    await load()
    expect(screen.getByText('경기.mp4')).toBeInTheDocument()
    expect(screen.getByText('1920×1080 · 1:00.0')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('영상 미리보기')).toHaveAttribute('src', 'blob:video'))
  })

  it('영상이 아닌 파일은 받지 않는다', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('영상 파일 불러오기'), { target: { files: [new File(['x'], '사진.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('mp4, mov, webm')
    expect(probeVideo).not.toHaveBeenCalled()
  })

  it('형식 정보가 없어도 확장자가 맞으면 받는다', async () => {
    await load(videoFile('아이폰.MOV', ''))
    expect(screen.getByText('아이폰.MOV')).toBeInTheDocument()
  })

  it('읽지 못하는 영상은 안내한다', async () => {
    vi.mocked(probeVideo).mockRejectedValue(new Error('bad'))
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('영상 파일 불러오기'), { target: { files: [videoFile()] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('읽지 못했습니다')
  })

  it('닫으면 처음 화면으로 돌아가고 주소를 해제한다', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.getByLabelText('영상 파일 불러오기')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })
})

describe('구간·배속·소리 (V-2, V-4, V-5)', () => {
  it('시작과 끝을 옮기면 구간과 결과 길이가 바뀐다', async () => {
    await load()
    slide('시작 지점', 10)
    slide('끝 지점', 25)
    expect(screen.getByText(/구간 0:15\.0 → 결과 0:15\.0/)).toBeInTheDocument()
  })

  it('미리보기의 지금 위치를 시작·끝으로 쓴다', async () => {
    await load()
    const video = screen.getByLabelText<HTMLVideoElement>('영상 미리보기')
    video.currentTime = 12
    fireEvent.click(screen.getByRole('button', { name: '지금 위치를 시작으로' }))
    video.currentTime = 18
    fireEvent.click(screen.getByRole('button', { name: '지금 위치를 끝으로' }))
    expect(screen.getByText(/구간 0:06\.0/)).toBeInTheDocument()
  })

  it('배속을 바꾸면 결과 길이가 줄고 미리보기 속도가 바뀐다', async () => {
    await load()
    fireEvent.change(screen.getByLabelText('배속'), { target: { value: '2' } })
    expect(screen.getByText(/구간 1:00\.0 → 결과 0:30\.0/)).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLVideoElement>('영상 미리보기').playbackRate).toBe(2)
  })

  it('배속에서는 소리가 빠지고, 원본 그대로 자르기를 고를 수 없다', async () => {
    await load()
    fireEvent.change(screen.getByLabelText('MP4 화질'), { target: { value: 'copy' } })
    fireEvent.change(screen.getByLabelText('배속'), { target: { value: '0.5' } })
    expect(screen.getByLabelText('소리 제거')).toBeChecked()
    expect(screen.getByLabelText('소리 제거')).toBeDisabled()
    expect(screen.getByLabelText('MP4 화질')).toHaveValue('720')
    expect(screen.getByRole('option', { name: /원본 그대로/ })).toBeDisabled()
  })

  it('소리 제거를 켜면 미리보기도 조용해진다', async () => {
    await load()
    fireEvent.click(screen.getByLabelText('소리 제거'))
    expect(screen.getByLabelText<HTMLVideoElement>('영상 미리보기').muted).toBe(true)
  })

  it('구간 재생은 시작 지점에서 틀고, 끝 지점에서 멈춘다 (V-6)', async () => {
    await load()
    slide('시작 지점', 10)
    slide('끝 지점', 20)
    const video = screen.getByLabelText<HTMLVideoElement>('영상 미리보기')
    fireEvent.click(screen.getByRole('button', { name: '구간 재생' }))
    expect(video.currentTime).toBe(10)
    expect(video.play).toHaveBeenCalled()

    Object.defineProperty(video, 'paused', { value: false, configurable: true })
    video.currentTime = 20.1
    fireEvent.timeUpdate(video)
    expect(video.pause).toHaveBeenCalled()
  })
})

describe('내보내기 (V-7)', () => {
  it('MP4는 고른 구간·배속·화질로 만들어 내려받는다', async () => {
    await load()
    slide('시작 지점', 5)
    slide('끝 지점', 15)
    fireEvent.change(screen.getByLabelText('MP4 화질'), { target: { value: '480' } })
    fireEvent.click(screen.getByRole('button', { name: 'MP4 내려받기' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(vi.mocked(exportMp4).mock.calls[0].slice(1, 3)).toEqual([{ start: 5, end: 15, speed: 1, muted: false }, 480])
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('경기-편집.mp4')
    expect(await screen.findByText(/MP4 파일을 내려받았습니다/)).toBeInTheDocument()
  })

  it('GIF는 너무 길면 만들지 않고 이유를 알린다', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'GIF 내려받기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('GIF는 결과 길이 15초까지')
    expect(exportGif).not.toHaveBeenCalled()
  })

  it('GIF를 본문에 넣는다', async () => {
    await load()
    slide('끝 지점', 8)
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (GIF)' }))
    await waitFor(() => expect(onInsertFiles).toHaveBeenCalled())
    const file = onInsertFiles.mock.calls[0][0][0] as File
    expect(file.name).toBe('경기-편집.gif')
    expect(file.type).toBe('image/gif')
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('본문에 넣기에는 너무 큰 GIF는 넣지 않는다', async () => {
    vi.mocked(exportGif).mockResolvedValue(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/gif' }))
    await load()
    slide('끝 지점', 8)
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기 (GIF)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('10MB까지')
    expect(onInsertFiles).not.toHaveBeenCalled()
  })

  it('만드는 동안 진행률과 취소가 보이고, 취소하면 그 사실을 알린다', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(exportMp4).mockImplementation(
      (_file, _clip, _quality, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal
          options?.onProgress?.(0.4)
          options?.signal?.addEventListener('abort', () => reject(new ExportCancelled()))
        }),
    )
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'MP4 내려받기' }))
    expect(await screen.findByText(/MP4 만드는 중… 40%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GIF 내려받기' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(signal?.aborted).toBe(true)
    expect(await screen.findByText('내보내기를 취소했습니다.')).toBeInTheDocument()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('실패하면 다시 시도하도록 안내한다', async () => {
    vi.mocked(exportMp4).mockRejectedValue(new Error('encoder'))
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'MP4 내려받기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('MP4를 만들지 못했습니다')
  })
})
