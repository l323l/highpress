import { EditorContent } from '@tiptap/react'
import { useState } from 'react'
import { SpellPanel } from '../spellcheck/SpellPanel'
import { Toolbar } from './Toolbar'
import type { ColumnEditor } from './useColumnEditor'

export function WritingPane({ editor, busy, locked, notice, clearNotice, insertFiles }: ColumnEditor) {
  const [spellOpen, setSpellOpen] = useState(false)
  return (
    <section className="writing" aria-label="글쓰기">
      {locked ? (
        <p className="writing__notice writing__notice--error" role="alert">
          이 칼럼의 본문 형식을 읽을 수 없어 편집을 잠갔습니다. 원본은 그대로 보관됩니다.
        </p>
      ) : (
        <Toolbar editor={editor} onInsertImages={(files) => void insertFiles(files)} spellOpen={spellOpen} onToggleSpell={() => setSpellOpen(!spellOpen)} />
      )}
      {spellOpen && !locked && <SpellPanel editor={editor} onClose={() => setSpellOpen(false)} />}
      {busy && (
        <p className="writing__notice" role="status">
          모션그래픽을 만드는 중…
        </p>
      )}
      {notice && (
        <p className="writing__notice writing__notice--error" role="alert">
          {notice}
          <button type="button" className="btn btn-ghost" onClick={clearNotice}>
            닫기
          </button>
        </p>
      )}
      <div className="writing__scroll" aria-busy={busy}>
        <EditorContent editor={editor} className="writing__surface" />
      </div>
    </section>
  )
}
