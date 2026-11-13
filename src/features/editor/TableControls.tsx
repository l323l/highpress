import type { Editor } from '@tiptap/react'
import { ToolButton } from './ToolButton'

export function TableControls({ editor, inTable }: { editor: Editor; inTable: boolean }) {
  const run = () => editor.chain().focus()
  return (
    <div className="tool-group" role="group" aria-label="표">
      <ToolButton label="표 넣기 (3×3)" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        표
      </ToolButton>
      {inTable && (
        <>
          <ToolButton label="행 추가" onClick={() => run().addRowAfter().run()}>
            +행
          </ToolButton>
          <ToolButton label="행 삭제" onClick={() => run().deleteRow().run()}>
            −행
          </ToolButton>
          <ToolButton label="열 추가" onClick={() => run().addColumnAfter().run()}>
            +열
          </ToolButton>
          <ToolButton label="열 삭제" onClick={() => run().deleteColumn().run()}>
            −열
          </ToolButton>
          <ToolButton label="표 삭제" onClick={() => run().deleteTable().run()}>
            표 삭제
          </ToolButton>
        </>
      )}
    </div>
  )
}
