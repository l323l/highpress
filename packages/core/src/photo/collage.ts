import type { Size } from './marks'

// 바탕 사진. 한 장이면 그대로, 두 장이면 붙여서 한 장으로 만든다.
// 크게 찍은 사진도 글에 넣기 알맞게 긴 변을 이만큼으로 줄인다 (본문 이미지는 10MB까지).
export const MAX_EDGE = 2000
// 불러올 수 있는 사진 (편집 전 원본). 기기 안에서만 읽으므로 본문 한도보다 넉넉하다.
export const SOURCE_MAX_BYTES = 30 * 1024 * 1024
export const SOURCE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type CollageLayout = 'row' | 'column'

export interface Cell {
  x: number
  y: number
  w: number
  h: number
}

export interface Plan {
  width: number
  height: number
  cells: Cell[]
}

const scaleFor = (width: number, height: number, maxEdge: number) => Math.min(1, maxEdge / Math.max(width, height))

export function planSingle(size: Size, maxEdge = MAX_EDGE): Plan {
  const k = scaleFor(size.width, size.height, maxEdge)
  const width = Math.max(1, Math.round(size.width * k))
  const height = Math.max(1, Math.round(size.height * k))
  return { width, height, cells: [{ x: 0, y: 0, w: width, h: height }] }
}

// 두 장을 좌우(row)나 위아래(column)로 붙인다. 좌우면 높이를, 위아래면 너비를 작은 쪽에 맞춘다.
// 사진은 자르지 않는다. gap 은 맞춘 변의 백분율(0 ~ 6)이다.
export function planCollage(a: Size, b: Size, layout: CollageLayout, gap: number, maxEdge = MAX_EDGE): Plan {
  const pct = Math.min(6, Math.max(0, gap)) / 100
  if (layout === 'row') {
    const h = Math.min(a.height, b.height)
    const wa = (a.width * h) / a.height
    const wb = (b.width * h) / b.height
    const g = h * pct
    const k = scaleFor(wa + wb + g, h, maxEdge)
    const H = Math.round(h * k)
    const A = Math.round(wa * k)
    const G = Math.round(g * k)
    // 반올림으로 긴 변이 한도를 넘지 않게, 전체를 먼저 정하고 마지막 칸이 나머지를 갖는다.
    const B = Math.round((wa + wb + g) * k) - A - G
    return { width: A + G + B, height: H, cells: [{ x: 0, y: 0, w: A, h: H }, { x: A + G, y: 0, w: B, h: H }] }
  }
  const w = Math.min(a.width, b.width)
  const ha = (a.height * w) / a.width
  const hb = (b.height * w) / b.width
  const g = w * pct
  const k = scaleFor(w, ha + hb + g, maxEdge)
  const W = Math.round(w * k)
  const A = Math.round(ha * k)
  const G = Math.round(g * k)
  const B = Math.round((ha + hb + g) * k) - A - G
  return { width: W, height: A + G + B, cells: [{ x: 0, y: 0, w: W, h: A }, { x: 0, y: A + G, w: W, h: B }] }
}

// 문제가 없으면 null, 있으면 보여 줄 문구.
export function sourceProblem(file: { name: string; type: string; size: number }): string | null {
  if (!(SOURCE_TYPES as readonly string[]).includes(file.type)) return `${file.name}: PNG, JPG, WebP, GIF 사진만 불러올 수 있습니다.`
  if (file.size === 0) return `${file.name}: 빈 파일입니다.`
  if (file.size > SOURCE_MAX_BYTES) return `${file.name}: 30MB보다 큰 사진은 불러올 수 없습니다.`
  return null
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || '사진'
