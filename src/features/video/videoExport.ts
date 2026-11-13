import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { frameTimestamps, hasAudio, markAt, markerActive, outputSize, VIDEO_LIMITS, type Clip, type Marker, type OutputHeight } from '@highpress/core/video'

export interface VideoInfo {
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

// 'copy'는 다시 인코딩하지 않고 잘라낸다. 빠르고 화질이 그대로지만 시작·끝이 키프레임에 맞춰 조금 넓어진다.
export type Mp4Quality = OutputHeight | 'copy'

export interface ExportOptions {
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
  // 영상 위에 함께 그릴 선수 강조 표시
  marker?: Marker
}

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// 조명의 모양: 반지름의 inner 배까지는 원래 밝기, outer 배부터는 dim 만큼 어둡다. 미리보기(video.css)와 같은 값이다.
export const SPOT = { inner: 0.9, outer: 1.7, dim: 0.62 } as const

// 원본 시각 t 의 표시를 그린다. 미리보기와 내보내기가 같은 모양을 쓴다.
export function drawMark(ctx: DrawContext, marker: Marker, t: number, width: number, height: number): void {
  const at = markAt(marker.keys, t)
  if (!at) return
  const radius = marker.size * height
  const line = Math.max(3, height * 0.007)
  ctx.save()
  if (marker.kind === 'spot') {
    // 조명: 선수 주변은 그대로 두고 바깥으로 갈수록 화면을 어둡게 덮는다.
    const light = ctx.createRadialGradient(at.x * width, at.y * height, radius * SPOT.inner, at.x * width, at.y * height, radius * SPOT.outer)
    light.addColorStop(0, 'rgba(0, 0, 0, 0)')
    light.addColorStop(1, `rgba(0, 0, 0, ${SPOT.dim})`)
    ctx.fillStyle = light
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
    return
  }
  ctx.beginPath()
  ctx.arc(at.x * width, at.y * height, radius, 0, Math.PI * 2)
  // 밝은 잔디 위에서도 보이도록 어두운 테두리를 먼저 깐다.
  ctx.lineWidth = line + Math.max(2, line * 0.6)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.stroke()
  ctx.lineWidth = line
  ctx.strokeStyle = marker.color
  ctx.stroke()
  ctx.restore()
}

export class ExportCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

// mediabunny는 영상을 실제로 다룰 때만 불러온다.
const load = () => import('mediabunny')

async function openInput(file: Blob) {
  const { ALL_FORMATS, BlobSource, Input } = await load()
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
}

// 읽을 수 없는 파일이면 예외를 던진다.
export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const input = await openInput(file)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video || !(await video.canDecode())) throw new Error('no decodable video track')
    const audio = await input.getPrimaryAudioTrack()
    return {
      duration: await input.computeDuration(),
      width: video.displayWidth,
      height: video.displayHeight,
      hasAudio: audio !== null,
    }
  } finally {
    input.dispose()
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelled()
}

export async function exportMp4(file: Blob, clip: Clip, quality: Mp4Quality, options: ExportOptions = {}): Promise<Blob> {
  // 표시를 그리려면 프레임을 다시 인코딩해야 한다. '원본 그대로'는 쓸 수 없다.
  const marked = markerActive(options.marker, clip)
  const height = quality === 'copy' && marked ? 720 : quality
  return clip.speed === 1 ? convertMp4(file, clip, height, options) : retimeMp4(file, clip, height === 'copy' ? 1080 : height, options)
}

// 원래 속도: 구간만 잘라 변환한다. 소리는 그대로 따라온다.
async function convertMp4(file: Blob, clip: Clip, quality: Mp4Quality, { onProgress, signal, marker }: ExportOptions): Promise<Blob> {
  const { BufferTarget, Conversion, Mp4OutputFormat, Output, QUALITY_HIGH } = await load()
  const input = await openInput(file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('no video track')
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const mark = quality !== 'copy' && markerActive(marker, clip) ? marker : null
    let canvas: OffscreenCanvas | null = null
    let ctx: OffscreenCanvasRenderingContext2D | null = null
    // 프레임 시각이 원본 기준인지 잘라낸 결과 기준인지는 첫 프레임에서 가린다.
    let offset: number | null = null
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: clip.start, end: clip.end },
      copy: quality === 'copy' ? { mode: 'forced', shiftTolerance: Infinity } : false,
      video:
        quality === 'copy'
          ? {}
          : {
              codec: 'avc',
              quality: QUALITY_HIGH,
              ...outputSize(track.displayWidth, track.displayHeight, quality),
              fit: 'fill',
              ...(mark
                ? {
                    process: (sample) => {
                      if (!canvas || !ctx) {
                        canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight)
                        ctx = canvas.getContext('2d', { alpha: false })
                        if (!ctx) throw new Error('canvas is not available')
                      }
                      offset ??= sample.timestamp < clip.start - 0.05 ? clip.start : 0
                      sample.draw(ctx, 0, 0, canvas.width, canvas.height)
                      drawMark(ctx, mark, sample.timestamp + offset, canvas.width, canvas.height)
                      return canvas
                    },
                  }
                : {}),
            },
      audio: { discard: !hasAudio(clip) },
    })
    if (!conversion.isValid) throw new Error('conversion is not possible')
    conversion.onProgress = (ratio) => onProgress?.(ratio)
    const cancel = () => void conversion.cancel()
    signal?.addEventListener('abort', cancel)
    try {
      throwIfCancelled(signal)
      await conversion.execute()
    } catch (error) {
      throwIfCancelled(signal)
      throw error
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
    if (!target.buffer) throw new Error('empty output')
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    input.dispose()
  }
}

// 배속: 결과 프레임마다 그 시각의 원본 프레임을 골라 다시 인코딩한다. 소리는 넣지 않는다.
async function retimeMp4(file: Blob, clip: Clip, height: OutputHeight, { onProgress, signal, marker }: ExportOptions): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSampleSink } = await load()
  const input = await openInput(file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('no video track')
    const size = outputSize(track.displayWidth, track.displayHeight, height)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('canvas is not available')

    const fps = VIDEO_LIMITS.outputFps
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
    output.addVideoTrack(source, { frameRate: fps })
    await output.start()
    try {
      const times = frameTimestamps(clip, fps)
      let i = 0
      for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(times)) {
        // 해당 시각에 프레임이 없으면 앞 프레임을 한 번 더 쓴다.
        if (sample) {
          sample.draw(ctx, 0, 0, size.width, size.height)
          sample.close()
          if (marker) drawMark(ctx, marker, times[i], size.width, size.height)
        }
        throwIfCancelled(signal)
        await source.add(i / fps, 1 / fps)
        i++
        onProgress?.(i / times.length)
      }
      await output.finalize()
    } catch (error) {
      await output.cancel().catch(() => undefined)
      throw error
    }
    if (!target.buffer) throw new Error('empty output')
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    input.dispose()
  }
}

export async function exportGif(file: Blob, clip: Clip, { onProgress, signal, marker }: ExportOptions = {}): Promise<Blob> {
  const { VideoSampleSink } = await load()
  const input = await openInput(file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('no video track')
    const width = Math.min(VIDEO_LIMITS.gifWidth, track.displayWidth)
    const height = Math.max(2, Math.round((width * track.displayHeight) / track.displayWidth))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas is not available')

    const fps = VIDEO_LIMITS.gifFps
    const times = frameTimestamps(clip, fps)
    const gif = GIFEncoder()
    let i = 0
    for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(times)) {
      if (sample) {
        sample.draw(ctx, 0, 0, width, height)
        sample.close()
        if (marker) drawMark(ctx, marker, times[i], width, height)
      }
      throwIfCancelled(signal)
      // 실제 영상은 장면마다 색이 달라 프레임마다 팔레트를 새로 만든다.
      const { data } = ctx.getImageData(0, 0, width, height)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: 1000 / fps, repeat: 0 })
      i++
      onProgress?.(i / times.length)
      // 화면이 멈추지 않게 한 박자 쉰다.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    gif.finish()
    return new Blob([gif.bytes()], { type: 'image/gif' })
  } finally {
    input.dispose()
  }
}
