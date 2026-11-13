import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { checkText, type SpellIssue } from '@highpress/core/spell'

// 맞춤법 검사 결과를 본문(ProseMirror 문서) 위치로 옮기고 고친다. 웹 맞춤법 창과 앱 웹뷰 에디터가 함께 쓴다.
// 규칙 자체는 @highpress/core/spell 에 있다.

// 사진 같은 글자 아닌 것은 이 한 글자 자리로 친다 (위치가 어긋나지 않게)
export const OBJECT_CHAR = '￼'

// 고칠 때 필요한 칸만 (앱은 웹뷰 밖에서 이 모양으로 돌려보낸다)
export type SpellTarget = Pick<SpellIssue, 'from' | 'to' | 'wrong' | 'right'>

// 본문을 문단 단위로 검사한다. 돌려주는 위치는 문서 위치다.
export function checkDoc(doc: ProseMirrorNode): SpellIssue[] {
  const issues: SpellIssue[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, OBJECT_CHAR)
    for (const issue of checkText(text)) issues.push({ ...issue, from: pos + 1 + issue.from, to: pos + 1 + issue.to })
    return false
  })
  return issues
}

// 검사한 뒤 글이 바뀌었을 수 있으므로, 그 자리에 아직 같은 말이 있을 때만 고친다.
export function stillThere(doc: ProseMirrorNode, issue: Pick<SpellIssue, 'from' | 'to' | 'wrong'>): boolean {
  return issue.from >= 0 && issue.from <= issue.to && issue.to <= doc.content.size && doc.textBetween(issue.from, issue.to, undefined, OBJECT_CHAR) === issue.wrong
}

// 뒤에서부터 고쳐야 앞쪽 위치가 밀리지 않는다. 한 번에 되돌릴 수 있게 한 묶음(트랜잭션)으로 만든다.
// 고칠 것이 하나도 남아 있지 않으면 null.
export function spellFixTransaction(state: EditorState, targets: readonly SpellTarget[]): Transaction | null {
  const tr = state.tr
  for (const issue of [...targets].sort((a, b) => b.from - a.from)) {
    if (stillThere(state.doc, issue)) tr.insertText(issue.right, issue.from, issue.to)
  }
  return tr.docChanged ? tr : null
}
