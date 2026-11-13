import { ReactNodeViewRenderer } from '@tiptap/react'
import { StatBlock as StatBlockSchema, STAT_BLOCK } from '@highpress/editor'
import { StatBlockView } from './StatBlockView'

export { STAT_BLOCK }

// 스키마 · HTML(평범한 표)은 @highpress/editor 의 것을 그대로 쓰고, 웹 화면에서는 애니메이션 도표로 그린다.
export const StatBlock = StatBlockSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(StatBlockView)
  },
})
