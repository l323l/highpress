// M0 ②③: WebCodecs(mediabunny)만으로, 교차 출처 격리 없이 V-2·V-4·V-7 성능을 잰다.
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

const params = new URLSearchParams(location.search)
const SECONDS = Number(params.get('seconds') ?? 60)
const FPS = 30
const W = 1920
const H = 1080
const report = { crossOriginIsolated: self.crossOriginIsolated, sourceSeconds: SECONDS, steps: {} }
const logEl = document.getElementById('log')
const log = (line) => {
  logEl.textContent += line + '\n'
}

async function timed(name, fn) {
  const t0 = performance.now()
  try {
    const extra = await fn()
    report.steps[name] = { ms: Math.round(performance.now() - t0), ...extra }
  } catch (error) {
    report.steps[name] = { ms: Math.round(performance.now() - t0), error: String(error) }
  }
  log(`${name}: ${JSON.stringify(report.steps[name])}`)
}

// 중계 화면처럼 화면 전체가 조금씩 바뀌는 합성 영상 (단색보다 인코딩 부담이 크다).
async function makeSource() {
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { alpha: false })
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const video = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_MEDIUM, keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: FPS })
  const audio = new AudioBufferSource({ codec: 'aac', bitrate: 96_000 })
  output.addAudioTrack(audio)
  await output.start()

  const rate = 48_000
  const tone = new AudioBuffer({ length: rate, sampleRate: rate, numberOfChannels: 1 })
  const data = tone.getChannelData(0)
  for (let i = 0; i < rate; i++) data[i] = Math.sin((i / rate) * 2 * Math.PI * 440) * 0.2

  const total = SECONDS * FPS
  for (let i = 0; i < total; i++) {
    const t = i / FPS
    ctx.fillStyle = `hsl(${120 + Math.sin(t / 7) * 12} 45% 32%)`
    ctx.fillRect(0, 0, W, H)
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = `hsl(${(k * 37) % 360} 70% ${40 + ((k * 13) % 30)}%)`
      const x = (W / 2) * (1 + Math.sin(t * (0.3 + k * 0.017) + k)) - 20
      const y = (H / 2) * (1 + Math.cos(t * (0.23 + k * 0.011) + k * 2)) - 20
      ctx.fillRect(x, y, 40 + (k % 5) * 12, 40 + (k % 7) * 9)
    }
    ctx.fillStyle = '#fff'
    ctx.font = '64px sans-serif'
    ctx.fillText(t.toFixed(2), 60, 100)
    await video.add(t, 1 / FPS)
    if (i % FPS === 0) await audio.add(tone)
  }
  await output.finalize()
  return new Blob([target.buffer], { type: 'video/mp4' })
}

const openInput = (blob) => new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })

async function convert(blob, options) {
  const input = openInput(blob)
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const conversion = await Conversion.init({ input, output, ...options })
  if (!conversion.isValid) throw new Error('invalid: ' + JSON.stringify(conversion.discardedTracks.map((d) => d.reason)))
  await conversion.execute()
  const result = await inspect(new Blob([target.buffer], { type: 'video/mp4' }))
  input.dispose()
  return result
}

async function inspect(blob) {
  const input = openInput(blob)
  const video = await input.getPrimaryVideoTrack()
  const audio = await input.getPrimaryAudioTrack()
  const info = {
    mb: +(blob.size / 1e6).toFixed(2),
    seconds: +(await input.computeDuration()).toFixed(2),
    size: video ? `${video.displayWidth}x${video.displayHeight}` : null,
    audio: Boolean(audio),
  }
  input.dispose()
  return info
}

// 배속: 프레임을 디코딩해 시각만 바꿔 다시 인코딩한다. 빨라질 때는 30fps를 넘는 프레임을 버린다. 소리는 넣지 않는다.
async function changeSpeed(blob, start, end, speed) {
  const input = openInput(blob)
  const track = await input.getPrimaryVideoTrack()
  const sink = new VideoSampleSink(track)
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const source = new VideoSampleSource({ codec: 'avc', quality: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: FPS })
  await output.start()
  let next = 0
  let frames = 0
  for await (const sample of sink.samples(start, end)) {
    const at = Math.max(0, (sample.timestamp - start) / speed)
    if (at + 1e-6 >= next) {
      sample.setTimestamp(at)
      sample.setDuration(sample.duration / speed)
      await source.add(sample)
      frames++
      next = at + 1 / FPS - 1e-3
    }
    sample.close()
  }
  await output.finalize()
  input.dispose()
  return { frames, ...(await inspect(new Blob([target.buffer], { type: 'video/mp4' }))) }
}

async function makeGif(blob, start, end, width, fps) {
  const input = openInput(blob)
  const track = await input.getPrimaryVideoTrack()
  const height = Math.round((width * track.displayHeight) / track.displayWidth)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const sink = new VideoSampleSink(track)
  const gif = GIFEncoder()
  let next = start
  let frames = 0
  for await (const sample of sink.samples(start, end)) {
    if (sample.timestamp + 1e-6 >= next) {
      sample.draw(ctx, 0, 0, width, height)
      const { data } = ctx.getImageData(0, 0, width, height)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: 1000 / fps })
      frames++
      next += 1 / fps
    }
    sample.close()
  }
  gif.finish()
  input.dispose()
  return { frames, size: `${width}x${height}`, mb: +(gif.bytes().length / 1e6).toFixed(2) }
}

async function run(file) {
  let blob = file
  if (!blob) {
    await timed('source', async () => {
      blob = await makeSource()
      return inspect(blob)
    })
  } else {
    report.steps.source = await inspect(blob)
    report.sourceSeconds = report.steps.source.seconds
  }
  if (!blob) return
  // 다른 확인에 쓸 수 있게 원본을 남긴다.
  window.__source = blob
  if (params.has('sourceOnly')) {
    report.done = true
    return
  }
  const length = report.steps.source.seconds ?? SECONDS
  const from = Math.min(10.4, length / 4)
  const clip = Math.min(30, length / 2)

  if (params.has('full')) {
    await timed('trimCopy30s', () => convert(blob, { trim: { start: from, end: from + clip }, copy: { mode: 'forced', shiftTolerance: Infinity } }))
    await timed('fullReencode', () => convert(blob, { copy: false }))
    await timed('fullReencode720p', () => convert(blob, { copy: false, video: { height: 720 } }))
    await timed('fullSpeed4x', () => changeSpeed(blob, 0, length, 4))
    report.done = true
    return
  }
  // V-2: 재인코딩 없는 자르기(키프레임 경계로 넓힘)와 정밀 자르기
  await timed('trimCopy30s', () => convert(blob, { trim: { start: from, end: from + clip }, copy: { mode: 'forced', shiftTolerance: Infinity } }))
  await timed('trimExact30s', () => convert(blob, { trim: { start: from, end: from + clip }, copy: false }))
  // 출력 720p, 하드웨어 인코더 우선
  await timed('trimExact30s720p', () => convert(blob, { trim: { start: from, end: from + clip }, copy: false, video: { height: 720 } }))
  await timed('trimExact30sHardware', () => convert(blob, { trim: { start: from, end: from + clip }, copy: false, video: { hardwareAcceleration: 'prefer-hardware' } }))
  await timed('trimExact30sSoftware', () => convert(blob, { trim: { start: from, end: from + clip }, copy: false, video: { hardwareAcceleration: 'prefer-software' } }))
  // V-5: 소리 제거
  await timed('trimExact30sMuted', () => convert(blob, { trim: { start: from, end: from + clip }, copy: false, audio: { discard: true } }))
  // V-4: 배속
  await timed('speed2x30s', () => changeSpeed(blob, from, from + clip, 2))
  await timed('speed0.5x10s', () => changeSpeed(blob, from, from + Math.min(10, clip), 0.5))
  // V-7: GIF
  await timed('gif10s480w10fps', () => makeGif(blob, from, from + Math.min(10, clip), 480, 10))
  // 10장: 전체 길이 재인코딩 (5분 1080p 목표)
  await timed('fullReencode', () => convert(blob, { copy: false }))
  await timed('fullSpeed4x', () => changeSpeed(blob, 0, length, 4))
  report.memoryMb = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null
  report.done = true
  log('done')
}

window.__spike = report
document.getElementById('file').addEventListener('change', (event) => run(event.target.files[0]))
if (!params.has('manual')) run()
