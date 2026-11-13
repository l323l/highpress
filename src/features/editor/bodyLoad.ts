import type { JSONContent } from '@tiptap/react'
import { db } from '../../db/db'
import { deleteMedia, getMediaBlob } from '../../db/store'
import type { Column } from '@highpress/core/db'
import { collectMediaIds, hydrateMediaSrc } from '@highpress/core/body'
import type { MediaUrls } from './mediaUrls'

// 방금 넣은 미디어는 아직 본문 저장 전일 수 있으므로 정리하지 않는다.
export const ORPHAN_GRACE_MS = 10 * 60 * 1000

function mapNodes(node: JSONContent, fn: (node: JSONContent) => JSONContent): JSONContent {
  const mapped = fn(node)
  return mapped.content ? { ...mapped, content: mapped.content.map((child) => mapNodes(child, fn)) } : mapped
}

// 본문에서 더는 쓰지 않는 이 칼럼의 미디어를 지운다. 지운 개수를 돌려준다.
export async function deleteOrphanMedia(columnId: string, body: JSONContent, now = Date.now()): Promise<number> {
  const used = new Set(collectMediaIds(body))
  const rows = await db.media.where('columnId').equals(columnId).toArray()
  const orphans = rows.filter((m) => !used.has(m.id) && now - m.createdAt > ORPHAN_GRACE_MS)
  await Promise.all(orphans.map((m) => deleteMedia(m.id)))
  return orphans.length
}

// 저장된 본문의 링크에는 주소와 제목만 남긴다. class·rel·target은 Link의 기본값으로 다시 그려진다.
export function normalizeLinkMarks(doc: JSONContent): JSONContent {
  return mapNodes(doc, (node) => {
    if (!node.marks?.some((mark) => mark.type === 'link')) return node
    const marks = node.marks.map((mark) => {
      if (mark.type !== 'link') return mark
      const { href, title } = mark.attrs ?? {}
      return { type: 'link', attrs: { href: typeof href === 'string' ? href : null, ...(typeof title === 'string' ? { title } : {}) } }
    })
    return { ...node, marks }
  })
}

// 칼럼을 열 때 본문을 준비한다: 안 쓰는 미디어 정리 → blob: URL 채우기.
// 정리가 실패해도 칼럼은 열려야 한다. 파일이 사라진 모션그래픽은 화면이 열린 뒤 tacticRestore가 다시 만든다.
export async function loadBody(column: Column, urls: MediaUrls): Promise<JSONContent> {
  await deleteOrphanMedia(column.id, column.body).catch(() => 0)
  // hydrateMediaSrc가 모양이 틀린 content를 먼저 걸러 준다.
  const hydrated = await hydrateMediaSrc(column.body, async (mediaId) => {
    const blob = await getMediaBlob(mediaId)
    return blob ? urls.create(mediaId, blob) : null
  })
  return normalizeLinkMarks(hydrated)
}
