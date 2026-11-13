import type { Editor, JSONContent } from '@tiptap/react'
import { db } from '../../db/db'
import { deleteMedia, putMedia } from '../../db/store'
import type { Media } from '../../db/types'
import type { TacticProject } from '@highpress/core/db'
import type { TacticDragPayload } from '@highpress/core/body'
import { renderTactic } from '../tactics'
import { splitImageFiles } from './imageFiles'
import type { MediaUrls } from './mediaUrls'

export interface InsertContext {
  columnId: string
  urls: MediaUrls
}

function imageNode(media: Media, blob: Blob, urls: MediaUrls, extra: Record<string, unknown> = {}): JSONContent | null {
  const src = urls.create(media.id, blob)
  if (!src) return null
  return { type: 'image', attrs: { src, mediaId: media.id, tacticProjectId: media.tacticProjectId, alt: media.name, ...extra } }
}

export type TacticImageFormat = TacticDragPayload['format']

// 모션그래픽을 그려 임시 미디어로 저장한다. 장면 번호는 프로젝트의 장면 수에 맞춘다.
export async function renderTacticMedia(
  project: TacticProject,
  format: TacticImageFormat,
  sceneIndex: number,
  columnId: string,
): Promise<{ media: Media; blob: Blob; sceneIndex: number }> {
  const clamped = Math.max(0, Math.min(sceneIndex, project.scenes.length - 1))
  const blob = await renderTactic(project, format, { sceneIndex: clamped })
  const media = await putMedia({
    columnId,
    kind: format === 'gif' ? 'gif' : 'image',
    temp: true,
    blob,
    name: `tactic-${project.id}.${format}`,
    tacticProjectId: project.id,
  })
  return { media, blob, sceneIndex: clamped }
}

// pos가 없으면 현재 커서 위치에 넣는다. 화면을 이미 떠났으면 방금 저장한 파일을 지우고 false.
async function insertNodes(editor: Editor, nodes: (JSONContent | null)[], media: Media[], pos?: number): Promise<boolean> {
  const content = nodes.filter((node) => node !== null)
  if (editor.isDestroyed || content.length !== media.length) {
    await Promise.all(media.map((m) => deleteMedia(m.id)))
    return false
  }
  // 커서 위치에 넣을 때는 선택 영역 뒤에 넣는다. 방금 넣은 이미지가 선택돼 있어도 그것을 갈아 끼우지 않는다.
  const at = Math.min(pos ?? editor.state.selection.to, editor.state.doc.content.size)
  editor.chain().focus().insertContentAt(at, content).run()
  return true
}

// 받아들이지 못한 파일의 안내 메시지를 돌려준다.
export async function insertImageFiles(editor: Editor, files: File[], ctx: InsertContext, pos?: number): Promise<string[]> {
  const { accepted, errors } = splitImageFiles(files)
  if (accepted.length === 0) return errors
  const media: Media[] = []
  for (const file of accepted) {
    media.push(
      await putMedia({ columnId: ctx.columnId, kind: file.type === 'image/gif' ? 'gif' : 'image', temp: false, blob: file, name: file.name }),
    )
  }
  await insertNodes(
    editor,
    media.map((m, i) => imageNode(m, accepted[i], ctx.urls)),
    media,
    pos,
  )
  return errors
}

// 모션그래픽을 렌더링해 본문에 넣는다 (E-6). 실패하면 예외를 던진다.
export async function insertTactic(editor: Editor, payload: TacticDragPayload, ctx: InsertContext, pos?: number): Promise<void> {
  // 렌더링하는 동안 본문이 바뀌면 놓은 자리도 함께 옮긴다.
  let target = pos
  const track = ({ transaction }: { transaction: { mapping: { map: (pos: number) => number } } }) => {
    if (target !== undefined) target = transaction.mapping.map(target)
  }
  editor.on('transaction', track)
  try {
    const project = await db.tacticProjects.get(payload.projectId)
    if (!project) throw new Error('tactic project not found')
    const { media, blob, sceneIndex } = await renderTacticMedia(project, payload.format, payload.sceneIndex ?? 0, ctx.columnId)
    // 파일이 사라져도 같은 모양으로 다시 만들 수 있게 형식과 장면을 노드에 적어 둔다.
    const extra = { tacticFormat: payload.format, tacticSceneIndex: payload.format === 'png' ? sceneIndex : null }
    const inserted = await insertNodes(editor, [imageNode(media, blob, ctx.urls, extra)], [media], target)
    // 조용히 사라지지 않게 한다: 넣지 못했으면 호출한 쪽이 안내 문구를 보여 준다.
    if (!inserted) throw new Error('editor is gone')
  } finally {
    editor.off('transaction', track)
  }
}
