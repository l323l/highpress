import { NAVER_LIMITS, NaverPostError } from '@highpress/core/naver'
import { db } from '../../db/db'
import { getMediaBlob } from '../../db/store'
import { getServer } from '../../lib/supabase'
import { buildExportDocument, type ExportFile } from '../export/exportDocument'
import type { CafeTarget } from './cafeTarget'

// 오류 종류와 화면 문구(NaverPostError · naverPostErrorText)는 @highpress/core/naver 에 있다.

// 사진은 본문 중간에 넣을 수 없고 글 맨 위에 순서대로 붙는다 (2026-10-12 실측). 본문에는 옮길 자리를 글자로 남긴다.
export const cafePlaceholder = (file: ExportFile) => `[사진 ${file.number} — 글 맨 위의 ${file.number}번째 사진을 여기로 옮기세요]`

function encode(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('canvas'))
  // jpeg 에는 투명이 없다. 투명한 곳은 흰 바탕으로 채운다.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', quality))
}

// 카페에 올릴 사진으로 바꾼다. 움직이는 GIF 는 한도 안이면 그대로 두고, 나머지는 jpeg 로 줄인다.
export async function cafeImage(source: Blob): Promise<Blob> {
  if (source.type === 'image/gif' && source.size <= NAVER_LIMITS.imageBytes) return source
  const bitmap = await createImageBitmap(source)
  try {
    let scale = Math.min(1, NAVER_LIMITS.imageEdge / Math.max(bitmap.width, bitmap.height))
    let quality = 0.88
    for (let attempt = 0; attempt < 8; attempt++) {
      const blob = await encode(bitmap, scale, quality)
      if (blob.size <= NAVER_LIMITS.imageBytes) return blob
      if (quality > 0.6) quality -= 0.1
      else scale *= 0.8
    }
    throw new Error('too big')
  } finally {
    bitmap.close()
  }
}

export interface NaverPostInput {
  columnId: string
  // 에디터의 지금 본문 (HTML)
  html: string
  title: string
  target: Pick<CafeTarget, 'clubId' | 'menuId'>
  token: string
}

// 칼럼을 네이버 카페에 올린다. 올라간 글의 주소를 돌려준다.
// shrink: 사진을 올릴 크기로 바꾸는 함수 (시험에서 바꿔 끼운다).
export async function postToCafe(input: NaverPostInput, shrink: (source: Blob) => Promise<Blob> = cafeImage): Promise<string> {
  const subject = input.title.trim().slice(0, NAVER_LIMITS.subject)
  if (!subject) throw new NaverPostError('no-title')

  // 파일을 실제로 읽을 수 있는 사진에만 번호를 준다 (내보내기와 같은 규칙).
  const media = await db.media.where('columnId').equals(input.columnId).toArray()
  const blobs = new Map<string, Blob>()
  for (const item of media) {
    const blob = item.kind === 'video' ? null : await getMediaBlob(item.id).catch(() => null)
    if (blob) blobs.set(item.id, blob)
  }
  const doc = buildExportDocument(input.html, (id) => (blobs.has(id) ? media.find((item) => item.id === id)?.mime : undefined), cafePlaceholder)
  if (doc.files.length > NAVER_LIMITS.images) throw new NaverPostError('too-many')
  if (new Blob([doc.html]).size > NAVER_LIMITS.contentBytes) throw new NaverPostError('too-big')

  const form = new FormData()
  form.set('token', input.token)
  form.set('clubId', input.target.clubId)
  form.set('menuId', input.target.menuId)
  form.set('subject', subject)
  form.set('content', doc.html)
  let total = 0
  for (const file of doc.files) {
    let image: Blob
    try {
      image = await shrink(blobs.get(file.mediaId)!)
    } catch {
      throw new NaverPostError('bad-image')
    }
    total += image.size
    if (total > NAVER_LIMITS.totalBytes) throw new NaverPostError('too-big')
    form.append('image', image, file.name)
  }

  const server = await getServer()
  if (!server) throw new NaverPostError('off')
  const { data, error } = await server.functions.invoke('naver', { body: form })
  if (!error) {
    const url = (data as { url?: unknown } | null)?.url
    if (typeof url === 'string' && /^https:\/\/cafe\.naver\.com\//.test(url)) return url
    throw new NaverPostError('failed')
  }
  // 서버 함수가 거절한 이유는 응답 본문에 있다.
  const response = (error as { context?: Response }).context
  const reply = response && typeof response.json === 'function' ? ((await response.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null) : null
  const code = String(reply?.error ?? '')
  const detail = typeof reply?.detail === 'string' ? reply.detail : ''
  if (code === 'too-fast') throw new NaverPostError('too-fast', detail)
  if (code === 'naver-login') throw new NaverPostError('login', detail)
  if (code === 'too-big' || code === 'bad-image') throw new NaverPostError(code, detail)
  if (code === 'off' || response?.status === 404) throw new NaverPostError('off')
  throw new NaverPostError('failed', detail)
}
