import type { Editor } from '@tiptap/react'
import { db } from '../../db/db'
import { deleteMedia, getMediaBlob, putMedia } from '../../db/store'
import type { InsertContext } from './mediaInsert'

// mediaId가 oldIds에 드는 이미지 노드를 새 미디어로 바꿔 끼운다. next가 null이면 노드를 지운다.
// 실행 취소 기록에는 남기지 않는다. 바꾼 노드 수를 돌려준다(화면을 떠났으면 0).
export function repointImages(editor: Editor, oldIds: Set<string>, next: { mediaId: string; src: string } | null): number {
  if (editor.isDestroyed) return 0
  const tr = editor.state.tr
  const hits: { pos: number; size: number; attrs: Record<string, unknown> }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && oldIds.has(node.attrs.mediaId)) hits.push({ pos, size: node.nodeSize, attrs: node.attrs })
  })
  // 뒤에서부터 고쳐야 앞쪽 위치가 밀리지 않는다.
  for (const hit of hits.reverse()) {
    if (next) tr.setNodeMarkup(hit.pos, undefined, { ...hit.attrs, ...next })
    else tr.delete(hit.pos, hit.pos + hit.size)
  }
  if (hits.length > 0) editor.view.dispatch(tr.setMeta('addToHistory', false))
  return hits.length
}

// 다른 칼럼에서 복사해 온 이미지는 그 칼럼의 미디어를 가리킨다. 그대로 두면 원래 칼럼이 정리될 때 파일이 함께 사라지므로,
// 이 칼럼 몫으로 파일을 복사해 연결을 바꾼다. 파일을 읽을 수 없으면 노드를 지운다.
// (모션그래픽은 지우지 않고 남겨 tacticRestore가 다시 만들게 한다.) 옮겨 온 미디어 수를 돌려준다.
export async function adoptForeignMedia(editor: Editor, ctx: InsertContext): Promise<number> {
  if (editor.isDestroyed || !editor.isEditable) return 0
  const candidates = new Map<string, boolean>()
  editor.state.doc.descendants((node) => {
    const { mediaId, tacticProjectId } = node.attrs
    if (node.type.name === 'image' && typeof mediaId === 'string') candidates.set(mediaId, typeof tacticProjectId === 'string')
  })

  let adopted = 0
  for (const [mediaId, isTactic] of candidates) {
    try {
      const row = await db.media.get(mediaId)
      if (!row || row.columnId === ctx.columnId) continue
      const blob = await getMediaBlob(mediaId)
      if (!blob) {
        if (!isTactic) repointImages(editor, new Set([mediaId]), null)
        continue
      }
      const media = await putMedia({
        columnId: ctx.columnId,
        kind: row.kind,
        temp: row.temp,
        blob,
        name: row.name,
        tacticProjectId: row.tacticProjectId ?? undefined,
      })
      const src = ctx.urls.create(media.id, blob)
      if (src && repointImages(editor, new Set([mediaId]), { mediaId: media.id, src }) > 0) adopted++
      else await deleteMedia(media.id)
    } catch {
      // 그대로 둔다. 다음에 열 때 다시 시도한다.
    }
  }
  return adopted
}
