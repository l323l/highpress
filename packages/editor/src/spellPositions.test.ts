import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import { checkDoc, spellFixTransaction, stillThere } from './spellPositions'

const editors: Editor[] = []
const make = (content: object | string) => {
  const editor = new Editor({ extensions: createExtensions({ resolveSrc: () => null }), content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

describe('맞춤법 위치 (웹 · 앱 웹뷰 공통)', () => {
  it('문단마다 검사해 문서 위치를 돌려준다', () => {
    const editor = make('<p>오랫만에</p><p>금새 됬다</p>')
    const issues = checkDoc(editor.state.doc)
    expect(issues.map((i) => [i.wrong, i.right])).toEqual([
      ['오랫만', '오랜만'],
      ['금새', '금세'],
      ['됬', '됐'],
    ])
    for (const issue of issues) expect(editor.state.doc.textBetween(issue.from, issue.to)).toBe(issue.wrong)
  })

  it('사진이 사이에 있어도 위치가 어긋나지 않는다', () => {
    const editor = make({
      type: 'doc',
      content: [
        { type: 'image', attrs: { mediaId: 'm1', src: null } },
        { type: 'paragraph', content: [{ type: 'text', text: '앞 금새' }] },
      ],
    })
    const [issue] = checkDoc(editor.state.doc)
    expect(editor.state.doc.textBetween(issue.from, issue.to)).toBe('금새')
  })

  it('모두 고치기는 한 묶음으로 고치고, 그사이 바뀐 곳은 건너뛴다', () => {
    const editor = make('<p>금새 됬다 오랫만</p>')
    const issues = checkDoc(editor.state.doc)
    // 검사한 뒤 "됬"을 사용자가 직접 고쳤다
    const typo = issues.find((i) => i.wrong === '됬')!
    editor.view.dispatch(editor.state.tr.insertText('됐', typo.from, typo.to))
    expect(stillThere(editor.state.doc, typo)).toBe(false)
    const tr = spellFixTransaction(editor.state, issues)!
    editor.view.dispatch(tr)
    expect(editor.getText()).toBe('금세 됐다 오랜만')
    // 한 번 되돌리면 모두 고치기만 되돌아간다
    editor.commands.undo()
    expect(editor.getText()).toBe('금새 됐다 오랫만')
  })

  it('고칠 것이 남아 있지 않으면 null', () => {
    const editor = make('<p>금새</p>')
    const issues = checkDoc(editor.state.doc)
    editor.commands.setContent('<p>다른 글</p>')
    expect(spellFixTransaction(editor.state, issues)).toBeNull()
    expect(stillThere(editor.state.doc, { from: 1, to: 999, wrong: 'x' })).toBe(false)
  })
})
