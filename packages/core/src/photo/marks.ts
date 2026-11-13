// 사진 위에 그리는 표시. 좌표는 모두 바탕 사진의 픽셀 기준이라 화면 크기가 바뀌어도 자리가 그대로다.
// 화면(PhotoCanvas)과 내보내는 파일이 같은 값으로 그린다.

export interface Point {
  x: number
  y: number
}

// 굵기 세 단계. 실제 두께는 사진 크기에 맞춰 정한다 (strokeWidth).
export type StrokeSize = 1 | 2 | 3

// 축구 그림의 관례: 실선 화살표는 공의 이동(패스 · 슈팅), 점선은 공 없는 움직임, 물결은 드리블.
export type ArrowVariant = 'pass' | 'run' | 'curve' | 'dribble'

interface Base {
  id: string
  color: string
}

export type Mark =
  | (Base & { kind: 'arrow'; variant: ArrowVariant; size: StrokeSize; from: Point; to: Point; mid: Point })
  | (Base & { kind: 'line'; size: StrokeSize; from: Point; to: Point })
  | (Base & { kind: 'ring'; size: StrokeSize; x: number; y: number; rx: number; ry: number })
  | (Base & { kind: 'spot'; x: number; y: number; rx: number; ry: number })
  | (Base & { kind: 'zone'; size: StrokeSize; x: number; y: number; w: number; h: number })
  | (Base & { kind: 'text'; x: number; y: number; text: string; fontSize: number; boxed: boolean })
  | (Base & { kind: 'number'; x: number; y: number; value: number; r: number })

export type MarkKind = Mark['kind']

// 아직 id 를 받지 않은 표시 (유니온의 갈래마다 id 만 뺀다).
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
export type NewMark = WithoutId<Mark>

// 'select' 는 고르고 옮기는 도구, 나머지는 그리는 도구.
export type ToolId = 'select' | ArrowVariant | 'line' | 'ring' | 'spot' | 'zone' | 'text' | 'number'

export interface Size {
  width: number
  height: number
}

// 방송 그래픽에서 많이 쓰는 색. 처음 고른 색은 형광 노랑.
export const SWATCHES = ['#ffe14d', '#ffffff', '#ff4d5e', '#38bdf8', '#3ddc84', '#111113'] as const
export const DEFAULT_COLOR = SWATCHES[0]

export const MARK_LIMITS = { maxMarks: 60, maxText: 40, maxNumber: 99, history: 60 } as const

// 사진의 긴 변 1000px 을 기준으로 한 크기 단위.
export const unitOf = (size: Size) => Math.max(size.width, size.height) / 1000

export function strokeWidth(size: Size, level: StrokeSize): number {
  return unitOf(size) * [0, 3.5, 5.5, 8][level]
}

// 화살촉 크기. 선이 굵을수록 커진다.
export function headSize(width: number) {
  return { length: width * 3.4, width: width * 3.2 }
}

let seq = 0
export const newMarkId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

// 곡선 화살표의 처음 휘어짐: 두 점의 가운데에서 선의 수직 방향으로 길이의 18%만큼 민 자리.
export function defaultMid(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return { x: (from.x + to.x) / 2 - dy * 0.18, y: (from.y + to.y) / 2 + dx * 0.18 }
}

// 드리블(물결) 화살표의 꺾은선 좌표. 끝의 화살촉 자리만큼은 곧게 두어 촉이 선 방향을 똑바로 가리키게 한다.
export function wavePoints(from: Point, to: Point, amplitude: number, wavelength: number, straightEnd: number): number[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return [from.x, from.y, to.x, to.y]
  const ux = dx / length
  const uy = dy / length
  const waveLength = Math.max(0, length - straightEnd)
  // 물결이 0에서 시작해 0에서 끝나도록 반 파장 단위로 맞춘다.
  const halves = Math.max(1, Math.round((waveLength / wavelength) * 2))
  const step = waveLength / (halves * 6)
  const points: number[] = []
  for (let i = 0; i <= halves * 6; i++) {
    const d = i * step
    const offset = Math.sin((i / 6) * Math.PI) * amplitude
    points.push(from.x + ux * d - uy * offset, from.y + uy * d + ux * offset)
  }
  points.push(to.x, to.y)
  return points
}

export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy })
  if (mark.kind === 'arrow') return { ...mark, from: shift(mark.from), to: shift(mark.to), mid: shift(mark.mid) }
  if (mark.kind === 'line') return { ...mark, from: shift(mark.from), to: shift(mark.to) }
  return { ...mark, x: mark.x + dx, y: mark.y + dy }
}

// 바탕 사진 밖으로 나가지 않게 점을 안으로 붙인다.
export const clampPoint = (p: Point, size: Size): Point => ({
  x: Math.min(size.width, Math.max(0, p.x)),
  y: Math.min(size.height, Math.max(0, p.y)),
})

// 밝은 바탕에는 검은 글자, 어두운 바탕에는 흰 글자.
export function inkOn(color: string): string {
  const hex = color.replace('#', '')
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.45 ? '#111113' : '#ffffff'
}

// 다음에 놓을 번호: 이미 있는 번호 가운데 가장 큰 것 + 1.
export function nextNumber(marks: Mark[]): number {
  const used = marks.flatMap((mark) => (mark.kind === 'number' ? [mark.value] : []))
  return Math.min(MARK_LIMITS.maxNumber, (used.length ? Math.max(...used) : 0) + 1)
}

// 이보다 짧게 끈 것은 누른 것으로 본다 (크기 단위의 배수).
export const DRAG_MIN = 12

// 끌어서 만든 도형. 너무 짧으면 null (누르기로 처리).
export function markFromDrag(tool: ToolId, from: Point, to: Point, size: Size, style: { color: string; size: StrokeSize }): NewMark | null {
  const u = unitOf(size)
  const long = Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_MIN * u
  const { color } = style
  switch (tool) {
    case 'pass':
    case 'run':
    case 'curve':
    case 'dribble':
      return long ? { kind: 'arrow', variant: tool, color, size: style.size, from, to, mid: defaultMid(from, to) } : null
    case 'line':
      return long ? { kind: 'line', color, size: style.size, from, to } : null
    case 'ring': {
      // 끌면 그 너비로, 누르면 기본 크기로. 선수 발밑에 깔리는 납작한 타원이다.
      const rx = long ? Math.max(Math.abs(to.x - from.x), 14 * u) : 46 * u
      return { kind: 'ring', color, size: style.size, x: from.x, y: from.y, rx, ry: rx * 0.36 }
    }
    case 'spot': {
      const r = long ? Math.max(Math.hypot(to.x - from.x, to.y - from.y), 24 * u) : 90 * u
      return { kind: 'spot', color, x: from.x, y: from.y, rx: r, ry: r }
    }
    case 'zone':
      if (!long) return null
      return { kind: 'zone', color, size: style.size, x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }
    default:
      return null
  }
}

// ── 되돌리기 ──────────────────────────────────────────────────────────────
export interface History {
  past: Mark[][]
  present: Mark[]
  future: Mark[][]
}

export const emptyHistory = (present: Mark[] = []): History => ({ past: [], present, future: [] })

export function commit(history: History, next: Mark[]): History {
  if (next === history.present) return history
  return { past: [...history.past, history.present].slice(-MARK_LIMITS.history), present: next, future: [] }
}

export function undo(history: History): History {
  const previous = history.past.at(-1)
  if (!previous) return history
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] }
}

export function redo(history: History): History {
  const [next, ...rest] = history.future
  if (!next) return history
  return { past: [...history.past, history.present], present: next, future: rest }
}
