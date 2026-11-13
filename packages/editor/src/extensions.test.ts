import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import { safeLineHeight } from './blockLineHeight'
import { safeSceneIndex, safeTacticFormat } from './mediaImage'
import { STAT_BLOCK } from './statBlock'

const editors: Editor[] = []
const make = (content: object | string, options: Partial<Parameters<typeof createExtensions>[0]> = {}) => {
  const editor = new Editor({ extensions: createExtensions({ resolveSrc: () => null, ...options }), content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

describe('공통 확장 목록', () => {
  it('파일 핸들러는 끌어놓기 · 붙여넣기 핸들러가 둘 다 있을 때만 넣는다', () => {
    const names = (opts: Partial<Parameters<typeof createExtensions>[0]>) =>
      createExtensions({ resolveSrc: () => null, ...opts }).map((e) => e.name)
    expect(names({})).not.toContain('fileHandler')
    expect(names({ onDropFiles: () => undefined, onPasteFiles: () => undefined })).toContain('fileHandler')
    expect(names({})).toEqual(expect.arrayContaining(['starterKit', 'blockLineHeight', 'textAlign', 'tableKit', 'image', STAT_BLOCK]))
  })

  it('미디어 사진은 저장 JSON에 mediaId와 전술 정보만 남기고, 화면 주소는 resolveSrc로 채운다', () => {
    const editor = make('<p>글</p><img data-media-id="m1" data-tactic-format="gif" data-tactic-scene-index="2" src="blob:x">', {
      resolveSrc: (id) => (id === 'm1' ? 'blob:session-m1' : null),
    })
    const image = editor.getJSON().content!.find((n) => n.type === 'image')!
    expect(image.attrs).toMatchObject({ mediaId: 'm1', src: 'blob:session-m1', tacticFormat: 'gif', tacticSceneIndex: 2 })
  })

  it('파일이 없는 사진은 자리표시로 그린다', () => {
    const editor = make({ type: 'doc', content: [{ type: 'image', attrs: { mediaId: 'gone', src: null } }] })
    expect(editor.view.dom.querySelector('.media-missing')?.textContent).toBe('이 기기에 없는 미디어')
  })

  it('스탯 블록은 노드 뷰 없이도 표로 그려지고 JSON이 그대로 남는다', () => {
    const doc = { type: 'doc', content: [{ type: STAT_BLOCK, attrs: { snapshot: null } }, { type: 'paragraph' }] }
    const editor = make(doc)
    expect(editor.getJSON().content![0].type).toBe(STAT_BLOCK)
  })

  it('줄간격은 숫자 꼴만 받는다', () => {
    expect(safeLineHeight('1.8')).toBe('1.8')
    expect(safeLineHeight('1; color: red')).toBeNull()
    const editor = make('<p style="line-height: expression(alert(1))">a</p><p style="line-height: 1.5">b</p>')
    const [a, b] = editor.getJSON().content!
    expect(a.attrs?.lineHeight).toBeNull()
    expect(b.attrs?.lineHeight).toBe('1.5')
  })

  it('javascript: 링크는 받지 않는다', () => {
    const editor = make('<p><a href="javascript:alert(1)">x</a> <a href="https://a.com">y</a></p>')
    expect(editor.getHTML()).not.toContain('javascript:')
    expect(editor.getHTML()).toContain('https://a.com')
  })

  it('전술 속성 모양을 확인한다', () => {
    expect(safeTacticFormat('png')).toBe('png')
    expect(safeTacticFormat('mp4')).toBeNull()
    expect(safeSceneIndex(0)).toBe(0)
    expect(safeSceneIndex(-1)).toBeNull()
    expect(safeSceneIndex(1.5)).toBeNull()
  })
})
