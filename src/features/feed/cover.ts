import type { JSONContent } from '@tiptap/react'
import { db } from '../../db/db'
import { getMediaBlob } from '../../db/store'
import { getFeedRemote } from './remote'

// 피드에 올리는 대표 사진: 긴 변 1280px 이하로 줄이고 380KB 안쪽으로 맞춘다 (서버 한도는 400KB).
export const COVER = { maxEdge: 1280, maxBytes: 380_000, choices: 8 } as const

// 대표 사진으로 고를 수 있는 본문 사진 한 장.
export interface CoverChoice {
  mediaId: string
  name: string
  blob: Blob
}

function collectMediaIds(node: JSONContent, out: string[], depth = 0): void {
  if (depth > 100) return
  const mediaId = node.type === 'image' ? node.attrs?.mediaId : null
  if (typeof mediaId === 'string' && mediaId && !out.includes(mediaId)) out.push(mediaId)
  if (!Array.isArray(node.content)) return
  for (const child of node.content) {
    if (typeof child === 'object' && child !== null) collectMediaIds(child, out, depth + 1)
  }
}

// 칼럼 본문에 들어 있는 사진을 본문에 나오는 순서대로 돌려준다. 영상은 빼고, 파일이 사라진 것도 뺀다.
export async function columnImages(columnId: string): Promise<CoverChoice[]> {
  const column = await db.columns.get(columnId)
  if (!column) return []
  const ids: string[] = []
  collectMediaIds(column.body, ids)
  const choices: CoverChoice[] = []
  for (const mediaId of ids) {
    if (choices.length >= COVER.choices) break
    const media = await db.media.get(mediaId)
    if (!media || media.columnId !== columnId || media.kind === 'video') continue
    const blob = await getMediaBlob(mediaId).catch(() => null)
    if (blob) choices.push({ mediaId, name: media.name, blob })
  }
  return choices
}

function encode(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('canvas'))
  // 투명한 곳은 흰 바탕으로 채운다 (jpeg 로 떨어질 때 검게 나오지 않게).
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/webp') return resolve(blob)
        // webp 로 만들지 못하는 브라우저는 jpeg 로 만든다.
        canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('encode'))), 'image/jpeg', quality)
      },
      'image/webp',
      quality,
    )
  })
}

// 사진을 피드에 올릴 크기로 줄인다. 움직이는 GIF 는 첫 장면만 남는다.
export async function makeCover(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    let scale = Math.min(1, COVER.maxEdge / Math.max(bitmap.width, bitmap.height))
    let quality = 0.82
    for (let attempt = 0; attempt < 8; attempt++) {
      const blob = await encode(bitmap, scale, quality)
      if (blob.size <= COVER.maxBytes) return blob
      // 먼저 화질을 낮추고, 그래도 크면 크기를 줄인다.
      if (quality > 0.6) quality -= 0.11
      else scale *= 0.8
    }
    throw new Error('cover too big')
  } finally {
    bitmap.close()
  }
}

// 받은 사진은 이 화면이 열려 있는 동안 다시 받지 않는다. 값은 blob: 주소이고, 받지 못했으면 null.
const loaded = new Map<string, Promise<string | null>>()

export function loadCover(path: string): Promise<string | null> {
  let pending = loaded.get(path)
  if (!pending) {
    pending = getFeedRemote()
      .then((remote) => (remote ? remote.cover(path) : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
    loaded.set(path, pending)
  }
  return pending
}

// 글을 다시 올리면 같은 위치의 사진이 바뀐다. 받아 둔 것을 버려 새로 받게 한다.
export function clearCovers(): void {
  for (const pending of loaded.values()) void pending.then((url) => url && URL.revokeObjectURL(url))
  loaded.clear()
}
