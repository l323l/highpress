import type { Editor } from '@tiptap/react'
import { db } from '../../db/db'
import { isId } from '@highpress/core/db'
import { deleteMedia } from '../../db/store'
import { renderTacticMedia, type InsertContext } from './mediaInsert'
import { repointImages } from './mediaRepair'
import { safeSceneIndex, safeTacticFormat } from './tacticDrop'

// 한 번 칼럼을 여는 동안 다시 만들 수 있는 모션그래픽 수. 조작된 본문이 렌더링을 끝없이 시키지 못하게 한다.
export const RESTORE_LIMIT = 20

export interface RestoreBudget {
  left: number
}

// 백업 복원 등으로 파일이 사라진 모션그래픽(자리표시)을 프로젝트에서 다시 만들어 끼워 넣는다.
// 화면이 열린 뒤에 돌고, 본문은 에디터 트랜잭션으로만 바꾸므로 평소의 자동 저장이 기록한다.
// 같은 그림(프로젝트·형식·장면)은 한 번만 만들어 함께 쓴다. 다시 만들지 못한 것은 자리표시로 남는다.
// 다시 만든 그림 수를 돌려준다.
export async function restoreTacticMedia(editor: Editor, ctx: InsertContext, budget: RestoreBudget = { left: RESTORE_LIMIT }): Promise<number> {
  if (editor.isDestroyed || !editor.isEditable) return 0
  const targets = new Map<string, Record<string, unknown>>()
  editor.state.doc.descendants((node) => {
    const { src, mediaId, tacticProjectId } = node.attrs
    if (node.type.name !== 'image' || src) return
    if (isId(mediaId) && isId(tacticProjectId)) targets.set(mediaId, node.attrs)
  })

  // 같은 그림을 가리키는 자리표시끼리 묶는다.
  const groups = new Map<string, { projectId: string; format: 'png' | 'gif'; sceneIndex: number; mediaIds: Set<string> }>()
  for (const [mediaId, attrs] of targets) {
    const projectId = attrs.tacticProjectId as string
    // 형식을 노드에 적어 두기 전에 만든 글은 남아 있는 미디어 기록을 보고, 그것도 없으면 그림으로 만든다.
    const stored = safeTacticFormat(attrs.tacticFormat) ?? (await db.media.get(mediaId).catch(() => undefined))?.kind
    const format = stored === 'gif' ? 'gif' : 'png'
    const sceneIndex = format === 'png' ? (safeSceneIndex(attrs.tacticSceneIndex) ?? 0) : 0
    const key = `${projectId}|${format}|${sceneIndex}`
    const group = groups.get(key) ?? { projectId, format, sceneIndex, mediaIds: new Set<string>() }
    group.mediaIds.add(mediaId)
    groups.set(key, group)
  }

  let restored = 0
  for (const group of groups.values()) {
    if (budget.left <= 0) break
    try {
      const project = await db.tacticProjects.get(group.projectId)
      if (!project) continue
      budget.left--
      const { media, blob } = await renderTacticMedia(project, group.format, group.sceneIndex, ctx.columnId)
      const src = editor.isDestroyed ? null : ctx.urls.create(media.id, blob)
      // 그 사이 화면을 떠났거나 자리표시를 지웠으면 방금 만든 파일은 필요 없다.
      if (src && repointImages(editor, group.mediaIds, { mediaId: media.id, src }) > 0) restored++
      else await deleteMedia(media.id)
    } catch {
      // 자리표시로 남긴다.
    }
  }
  return restored
}
