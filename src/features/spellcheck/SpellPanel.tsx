import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { XIcon } from '../../components/icons'
import { RULE_COUNT, type SpellIssue } from '@highpress/core/spell'
// 문서 위치 계산 · 고치기는 앱 웹뷰 에디터와 같은 것을 쓴다
import { checkDoc, spellFixTransaction, stillThere } from '@highpress/editor'

// 한 번에 보여 주는 개수. 그보다 많으면 고쳐 나가는 대로 다음 것이 올라온다.
const SHOWN = 40

export function SpellPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [issues, setIssues] = useState(() => checkDoc(editor.state.doc))

  useEffect(() => {
    const recheck = () => setIssues(checkDoc(editor.state.doc))
    recheck()
    editor.on('update', recheck)
    return () => {
      editor.off('update', recheck)
    }
  }, [editor])

  const show = (issue: SpellIssue) => {
    if (stillThere(editor.state.doc, issue)) editor.chain().focus().setTextSelection({ from: issue.from, to: issue.to }).scrollIntoView().run()
  }

  // 뒤에서부터 한 묶음으로 고친다 (한 번에 되돌릴 수 있게)
  const fix = (targets: SpellIssue[]) => {
    const tr = spellFixTransaction(editor.state, targets)
    if (tr) editor.view.dispatch(tr)
  }

  return (
    <section className="spell" aria-label="맞춤법 검사">
      <header className="spell__head">
        <p className="spell__title" role="status">
          {issues.length === 0 ? '고칠 곳을 찾지 못했습니다' : `고칠 곳 ${issues.length}군데`}
        </p>
        <span className="spell__actions">
          {issues.length > 1 && (
            <button type="button" className="btn" onClick={() => fix(issues)}>
              모두 고치기
            </button>
          )}
          <button type="button" className="icon-btn icon-btn--sm" aria-label="맞춤법 검사 닫기" title="닫기" onClick={onClose}>
            <XIcon size={16} aria-hidden="true" />
          </button>
        </span>
      </header>
      {issues.length > 0 && (
        <ul className="spell__list">
          {issues.slice(0, SHOWN).map((issue) => (
            <li key={`${issue.from}-${issue.wrong}`} className="spell__item">
              <button type="button" className="spell__where" title="본문에서 보기" onClick={() => show(issue)}>
                <del>{issue.wrong.replaceAll(' ', '␣')}</del>
                <span aria-hidden="true">→</span>
                <ins>{issue.right}</ins>
              </button>
              <span className="spell__why muted">{issue.why}</span>
              <button type="button" className="btn" aria-label={`"${issue.wrong}"을 "${issue.right}"로 고치기`} onClick={() => fix([issue])}>
                고치기
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="spell__note muted">
        자주 틀리는 표현 {RULE_COUNT}가지를 이 기기 안에서 검사합니다. 글은 어디에도 보내지 않습니다. 목록에 없는 오류와 문맥을 봐야 아는 띄어쓰기는 잡지 못합니다.
      </p>
    </section>
  )
}
