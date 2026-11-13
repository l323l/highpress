import type { Extensions } from '@tiptap/react'
import { createExtensions as createSharedExtensions, type FileHandlers } from '@highpress/editor'
import { StatBlock } from '../stats'

// 확장 목록 · 스키마는 @highpress/editor 가 갖고 있다 (앱 웹뷰 에디터와 같게). 웹은 스탯 도표 노드 뷰만 붙인다.
export { MISSING_MEDIA_TEXT, MediaImage } from '@highpress/editor'

export interface EditorExtensionHandlers extends FileHandlers {
  resolveSrc: (mediaId: string) => string | null
}

export function createExtensions(handlers: EditorExtensionHandlers): Extensions {
  return createSharedExtensions({ ...handlers, statBlock: StatBlock })
}
