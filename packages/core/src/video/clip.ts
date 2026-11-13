// 영상 한 구간을 어떻게 내보낼지에 대한 설정과 계산. 브라우저 API를 쓰지 않는다.

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
export const VIDEO_ACCEPT = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm'

export const VIDEO_LIMITS = {
  // 불러올 수 있는 파일 크기. 파일은 메모리에 올리지 않고 필요한 부분만 읽는다.
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  // 내보낼 구간의 길이(원본 기준)
  maxClipSeconds: 300,
  minClipSeconds: 0.2,
  // GIF는 프레임마다 팔레트를 만들어 느리고 파일이 커서 짧게 제한한다.
  // 느리게 하면 결과가 길어진다. 결과물 길이의 상한.
  maxOutputSeconds: 600,
  maxGifSeconds: 15,
  gifWidth: 480,
  gifFps: 10,
  outputFps: 30,
} as const

export const OUTPUT_HEIGHTS = [1080, 720, 480] as const
export type OutputHeight = (typeof OUTPUT_HEIGHTS)[number]

export interface Clip {
  // 원본 기준 초
  start: number
  end: number
  speed: number
  muted: boolean
}

export function defaultClip(duration: number): Clip {
  return { start: 0, end: Math.min(duration, VIDEO_LIMITS.maxClipSeconds), speed: 1, muted: false }
}

const round = (seconds: number) => Math.round(seconds * 100) / 100

// 시작·끝이 영상 안에 있고 최소 길이만큼 떨어지게 한다. moved 쪽을 사용자가 방금 움직인 것으로 보고 반대쪽을 밀어낸다.
export function clampRange(start: number, end: number, duration: number, moved: 'start' | 'end' = 'end'): { start: number; end: number } {
  const total = Math.max(duration, VIDEO_LIMITS.minClipSeconds)
  const gap = VIDEO_LIMITS.minClipSeconds
  let s = Math.min(Math.max(0, Number.isFinite(start) ? start : 0), total)
  let e = Math.min(Math.max(0, Number.isFinite(end) ? end : total), total)
  if (moved === 'start') {
    s = Math.min(s, total - gap)
    if (e < s + gap) e = s + gap
  } else {
    e = Math.max(e, gap)
    if (s > e - gap) s = e - gap
  }
  return { start: round(s), end: round(e) }
}

export function clipSeconds(clip: Pick<Clip, 'start' | 'end'>): number {
  return Math.max(0, clip.end - clip.start)
}

// 배속을 적용한 결과물의 길이
export function outputSeconds(clip: Pick<Clip, 'start' | 'end' | 'speed'>): number {
  return clipSeconds(clip) / clip.speed
}

// 배속을 바꾸면 소리의 높낮이가 달라지므로 소리를 넣지 않는다.
export function hasAudio(clip: Pick<Clip, 'speed' | 'muted'>): boolean {
  return !clip.muted && clip.speed === 1
}

// 내보낼 수 없는 이유. 없으면 null.
export function clipProblem(clip: Clip, format: 'mp4' | 'gif'): string | null {
  const seconds = clipSeconds(clip)
  if (seconds < VIDEO_LIMITS.minClipSeconds) return '구간이 너무 짧습니다.'
  if (seconds > VIDEO_LIMITS.maxClipSeconds) return `구간은 ${VIDEO_LIMITS.maxClipSeconds / 60}분까지 내보낼 수 있습니다.`
  if (outputSeconds(clip) > VIDEO_LIMITS.maxOutputSeconds) {
    return `결과 길이는 ${VIDEO_LIMITS.maxOutputSeconds / 60}분까지 만들 수 있습니다. 구간을 줄이거나 배속을 높여 주세요.`
  }
  if (format === 'gif' && outputSeconds(clip) > VIDEO_LIMITS.maxGifSeconds) {
    return `GIF는 결과 길이 ${VIDEO_LIMITS.maxGifSeconds}초까지 만들 수 있습니다.`
  }
  return null
}

// 원본보다 크게 늘리지 않는다. 인코더가 받도록 짝수로 맞춘다.
export function outputSize(width: number, height: number, target: OutputHeight): { width: number; height: number } {
  const h = Math.min(height, target)
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return { width: even((width * h) / height), height: even(h) }
}

// 1:05.3 형태
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const tenths = Math.round(safe * 10)
  const minutes = Math.floor(tenths / 600)
  const rest = (tenths - minutes * 600) / 10
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

// ── 선수 강조 표시 ───────────────────────────────────────────────────────
// 영상 위에 그리는 원 하나. 시각마다 위치를 찍어 두면 그 사이를 곧게 이어 움직인다.
// 선수를 자동으로 따라가지 않으므로, 빠르게 움직이는 구간은 위치를 더 촘촘히 찍는다.

export interface MarkKey {
  // 원본 기준 초
  t: number
  // 영상 안의 위치 (0~1). x는 왼쪽→오른쪽, y는 위→아래.
  x: number
  y: number
}

// ring: 선수 둘레에 원을 그린다. spot: 선수 주변만 밝게 두고 나머지 화면을 어둡게 한다(조명).
export type MarkKind = 'ring' | 'spot'

export interface Marker {
  keys: MarkKey[]
  // 원의 반지름. 영상 높이에 대한 비율.
  size: number
  color: string
  kind?: MarkKind
}

export const MARK_LIMITS = {
  // 0.1초마다 기록하면 5분 구간이 3000곳이다.
  maxKeys: 3000,
  minSize: 0.03,
  maxSize: 0.25,
  // 이 간격 안의 시각은 같은 자리로 보고 덮어쓴다.
  sameSeconds: 0.05,
  // 위치를 한 군데만 찍었을 때 보이는 시간
  singleSeconds: 1.5,
  // 누르고 있는 동안 이 간격(영상 시간)마다 위치를 기록한다.
  recordSeconds: 0.1,
} as const

// 기록할 때 고를 수 있는 재생 속도. 느리게 틀면 빠른 장면도 따라갈 수 있다.
export const RECORD_SPEEDS = [0.25, 0.5, 1] as const

export const DEFAULT_MARKER: Marker = { keys: [], size: 0.08, color: '#ffe600', kind: 'ring' }

const unit = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

// 그 시각의 위치를 찍는다. 같은 시각에 이미 있으면 옮긴다. 한도를 넘으면 그대로 돌려준다.
export function setMarkKey(keys: MarkKey[], key: MarkKey): MarkKey[] {
  const next: MarkKey = { t: round(Math.max(0, key.t)), x: unit(key.x), y: unit(key.y) }
  const at = keys.findIndex((item) => Math.abs(item.t - next.t) <= MARK_LIMITS.sameSeconds)
  if (at >= 0) return keys.map((item, i) => (i === at ? { ...next, t: item.t } : item))
  if (keys.length >= MARK_LIMITS.maxKeys) return keys
  return [...keys, next].sort((a, b) => a.t - b.t)
}

export function removeMarkKey(keys: MarkKey[], t: number): MarkKey[] {
  return keys.filter((item) => Math.abs(item.t - t) > MARK_LIMITS.sameSeconds)
}

// 재생하면서 기록할 때: 방금 지나온 구간(from 뒤부터 지금까지)에 예전에 찍은 위치가 있으면 지우고 새 위치를 찍는다.
// 같은 구간을 다시 기록하면 새 움직임으로 바뀐다.
export function recordMarkKey(keys: MarkKey[], from: number, key: MarkKey): MarkKey[] {
  const kept = keys.filter((item) => item.t <= from + MARK_LIMITS.sameSeconds || item.t > key.t + MARK_LIMITS.sameSeconds)
  return setMarkKey(kept, key)
}

// 그 시각에 원이 있을 자리. 표시가 보이지 않는 시각이면 null.
// 첫 위치부터 마지막 위치까지 보이고, 한 군데만 찍었으면 그때부터 잠깐 보인다.
export function markAt(keys: MarkKey[], t: number): { x: number; y: number } | null {
  if (keys.length === 0) return null
  const first = keys[0]
  const last = keys[keys.length - 1]
  const until = keys.length === 1 ? first.t + MARK_LIMITS.singleSeconds : last.t
  if (t < first.t - 1e-6 || t > until + 1e-6) return null
  // 지금 시각 바로 앞의 위치를 찾는다 (위치가 수천 곳이어도 프레임마다 빠르게).
  let low = 0
  let high = keys.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (keys[middle].t <= t) low = middle
    else high = middle - 1
  }
  const a = keys[low]
  const b = keys[low + 1]
  if (!b || t <= a.t) return { x: a.x, y: a.y }
  const ratio = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
}

// 내보낼 구간 안에서 표시가 한 번이라도 보이는지.
export function markerActive(marker: Marker | undefined, clip: Pick<Clip, 'start' | 'end'>): marker is Marker {
  if (!marker || marker.keys.length === 0) return false
  const first = marker.keys[0].t
  const until = marker.keys.length === 1 ? first + MARK_LIMITS.singleSeconds : marker.keys[marker.keys.length - 1].t
  return first <= clip.end && until >= clip.start
}

// 결과물의 i번째 프레임에 쓸 원본 시각. 배속과 무관하게 결과는 fps로 고르게 나온다.
export function frameTimestamps(clip: Pick<Clip, 'start' | 'end' | 'speed'>, fps: number): number[] {
  const count = Math.max(1, Math.floor(outputSeconds(clip) * fps + 1e-6))
  return Array.from({ length: count }, (_, i) => clip.start + (i * clip.speed) / fps)
}
