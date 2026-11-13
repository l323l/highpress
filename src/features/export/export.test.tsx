/// <reference types="node" />
import { Blob as NodeBlob } from 'node:buffer'
import { generateHTML, type Editor } from '@tiptap/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { createColumn, putMedia } from '../../db/store'
import { createExtensions } from '../editor/extensions'
import { ExportButton } from './ExportButton'
import { buildExportDocument, MISSING_LABEL } from './exportDocument'
import { buildZip, loadExportEntries } from './exportMedia'

// jsdom의 Blob은 fake-indexeddb를 거치면 빈 객체가 되므로 Node Blob을 쓴다 (backup.test.ts와 같은 이유).
beforeAll(() => vi.stubGlobal('Blob', NodeBlob))
afterAll(() => vi.unstubAllGlobals())

const mimes: Record<string, string> = { a: 'image/png', b: 'image/gif', c: 'image/jpeg' }
const mimeOf = (id: string) => mimes[id]

describe('buildExportDocument', () => {
  it('이미지를 나온 순서대로 번호 자리표시로 바꾸고 같은 번호의 파일명을 돌려준다', () => {
    const doc = buildExportDocument(
      '<p>앞</p><img src="blob:x" data-media-id="a"><p>사이</p><img src="blob:y" data-media-id="b" data-tactic-project-id="p1"><p>뒤</p>',
      mimeOf,
    )
    expect(doc.files).toEqual([
      { number: 1, name: '01.png', mediaId: 'a' },
      { number: 2, name: '02.gif', mediaId: 'b' },
    ])
    expect(doc.html).not.toContain('<img')
    expect(doc.html).not.toContain('blob:')
    expect(doc.html).not.toContain('data-')
    expect(doc.html).toContain('[이미지 1 — 01.png 를 여기에 첨부]')
    expect(doc.html).toContain('[이미지 2 — 02.gif 를 여기에 첨부]')
    expect(doc.text).toBe('앞\n[이미지 1 — 01.png 를 여기에 첨부]\n사이\n[이미지 2 — 02.gif 를 여기에 첨부]\n뒤')
    expect(doc.missing).toBe(0)
  })

  it('같은 그림을 두 번 넣으면 파일 하나를 같은 번호로 가리킨다', () => {
    const doc = buildExportDocument('<img data-media-id="a"><img data-media-id="c"><img data-media-id="a">', mimeOf)
    expect(doc.files.map((f) => f.name)).toEqual(['01.png', '02.jpg'])
    expect(doc.html.match(/\[이미지 1 —/g)).toHaveLength(2)
  })

  it('파일을 알 수 없는 이미지는 번호 없이 표시하고 센다', () => {
    const doc = buildExportDocument('<img data-media-id="gone"><img src="https://evil.example/x.png">', mimeOf)
    expect(doc.files).toEqual([])
    expect(doc.missing).toBe(2)
    expect(doc.html).toContain(MISSING_LABEL)
    expect(doc.html).not.toContain('evil.example')
  })

  it('문단 안의 이미지는 그 자리의 글자로, 표 칸에는 인라인 테두리를 넣는다', () => {
    const doc = buildExportDocument(
      '<p>글 <img data-media-id="a"> 글</p><table><tbody><tr><th><p>순위</p></th></tr><tr><td style="text-align: center"><p>1</p></td></tr></tbody></table>',
      mimeOf,
    )
    expect(doc.html).toMatch(/<p>글 <span style="color: #868e96;">\[이미지 1 — 01\.png 를 여기에 첨부\]<\/span> 글<\/p>/)
    expect(doc.html).toContain('<table style="border-collapse: collapse;">')
    expect(doc.html).toContain('<th style="border: 1px solid #999999; padding: 4px 8px; background-color: #f1f3f5;">')
    expect(doc.html).toContain('<td style="text-align: center; border: 1px solid #999999; padding: 4px 8px;">')
  })

  it('사용자가 정한 머리글 칸 색은 덮지 않고, 일반 텍스트에서 줄바꿈을 살린다', () => {
    const doc = buildExportDocument(
      '<table><tbody><tr><th style="background-color: #ffec99"><p>머리</p></th></tr></tbody></table><p>첫 줄<br>둘째 줄</p>',
      mimeOf,
    )
    expect(doc.html).toMatch(/<th style="background-color: (#ffec99|rgb\(255, 236, 153\)); border: 1px solid #999999; padding: 4px 8px;">/)
    expect(doc.html).toContain('첫 줄<br>둘째 줄')
    expect(doc.text).toBe('머리\n첫 줄\n둘째 줄')
  })

  it('글자 서식은 유지하고 스크립트·이벤트 핸들러·클래스는 뺀다', () => {
    const doc = buildExportDocument(
      '<p style="text-align: center; line-height: 2"><span style="color: #e03131; font-size: 24px">빨강</span> <strong>굵게</strong> <a href="https://naver.com" class="btn">링크</a></p><script>alert(1)</script><p onclick="x()" class="fab">끝</p>',
      mimeOf,
    )
    expect(doc.html).toContain('text-align: center')
    expect(doc.html).toContain('line-height: 2')
    expect(doc.html).toContain('color: #e03131')
    expect(doc.html).toContain('<strong>굵게</strong>')
    expect(doc.html).toContain('href="https://naver.com"')
    expect(doc.html).not.toMatch(/script|onclick|class=/)
  })
})

describe('에디터가 실제로 내는 HTML', () => {
  it('Tiptap 직렬화 결과에서도 이미지 자리표시·표 테두리·서식이 나온다', () => {
    const extensions = createExtensions({ resolveSrc: () => null, onDropFiles: () => undefined, onPasteFiles: () => undefined })
    const html = generateHTML(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'center', lineHeight: '2' },
            content: [{ type: 'text', text: '가운데', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#e03131' } }] }],
          },
          { type: 'image', attrs: { src: 'blob:http://localhost/x', mediaId: 'b', tacticProjectId: 'p1', tacticFormat: 'gif' } },
          {
            type: 'table',
            content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '칸' }] }] }] }],
          },
        ],
      },
      extensions,
    )
    const doc = buildExportDocument(html, mimeOf)

    expect(doc.files).toEqual([{ number: 1, name: '01.gif', mediaId: 'b' }])
    expect(doc.html).toContain('[이미지 1 — 01.gif 를 여기에 첨부]')
    expect(doc.html).not.toMatch(/<img|blob:|data-|class=/)
    expect(doc.html).toMatch(/^<p style="line-height: 2; text-align: center;">/)
    expect(doc.html).toMatch(/color: (#e03131|rgb\(224, 49, 49\))/)
    expect(doc.html).toContain('<strong>가운데</strong>')
    expect(doc.html).toMatch(/<table style="[^"]*border-collapse: collapse;">/)
    expect(doc.html).toMatch(/<td[^>]*style="[^"]*border: 1px solid #999999; padding: 4px 8px;"/)
    expect(doc.text).toBe('가운데\n[이미지 1 — 01.gif 를 여기에 첨부]\n칸')
  })
})

describe('미디어 내보내기', () => {
  it('ZIP 안의 파일명이 자리표시 번호와 같고 내용이 보존된다', async () => {
    const column = await createColumn()
    const png = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), name: 'x.png' })
    const gif = await putMedia({ columnId: column.id, kind: 'gif', temp: true, blob: new Blob([new Uint8Array([7, 7])], { type: 'image/gif' }), name: 'y.gif' })
    const doc = buildExportDocument(`<img data-media-id="${png.id}"><img data-media-id="${gif.id}"><img data-media-id="gone">`, (id) =>
      id === png.id ? 'image/png' : id === gif.id ? 'image/gif' : undefined,
    )

    const entries = await loadExportEntries([...doc.files, { number: 9, name: '09.png', mediaId: 'gone' }])
    expect(entries.map((e) => e.name)).toEqual(['01.png', '02.gif'])

    const zip = await buildZip(entries)
    expect(zip.type).toBe('application/zip')
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.keys(files)).toEqual(['01.png', '02.gif'])
    expect([...files['01.png']]).toEqual([1, 2, 3])
    expect([...files['02.gif']]).toEqual([7, 7])
  })
})

describe('ExportButton', () => {
  const fakeEditor = (html: string) => ({ getHTML: () => html }) as unknown as Editor

  it('서식 유지 복사가 text/html과 text/plain을 클립보드에 쓴다', async () => {
    const column = await createColumn()
    const media = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), name: 'x.png' })
    const user = userEvent.setup()
    const write = vi.fn(async (_items: unknown[]) => undefined)
    vi.stubGlobal(
      'ClipboardItem',
      class {
        items: Record<string, Promise<Blob>>
        constructor(items: Record<string, Promise<Blob>>) {
          this.items = items
        }
      },
    )
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })

    render(<ExportButton editor={fakeEditor(`<p><strong>본문</strong></p><img data-media-id="${media.id}">`)} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    await user.click(screen.getByRole('button', { name: '서식 유지 복사' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('복사했습니다'))
    const item = write.mock.calls[0][0][0] as { items: Record<string, Promise<Blob>> }
    const html = await (await item.items['text/html']).text()
    expect(html).toContain('<strong>본문</strong>')
    expect(html).toContain('[이미지 1 — 01.png 를 여기에 첨부]')
    expect(await (await item.items['text/plain']).text()).toBe('본문\n[이미지 1 — 01.png 를 여기에 첨부]')
    expect(screen.getByText('첨부 순서: 01.png')).toBeInTheDocument()
  })

  it('파일을 읽을 수 없는 미디어에는 번호를 주지 않고 빠졌다고 알린다', async () => {
    const column = await createColumn()
    const media = await putMedia({ columnId: column.id, kind: 'gif', temp: true, blob: new Blob([new Uint8Array([1])], { type: 'image/gif' }), name: 'x.gif' })
    // OPFS 파일이 사라진 temp 미디어를 흉내 낸다: 행은 있는데 blob도 경로도 없다.
    await db.media.update(media.id, { blob: undefined })
    const user = userEvent.setup()
    const write = vi.fn(async (_items: unknown[]) => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })

    render(<ExportButton editor={fakeEditor(`<p>글</p><img data-media-id="${media.id}">`)} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    await user.click(screen.getByRole('button', { name: '서식 유지 복사' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('파일이 없는 이미지 1개는 빠졌습니다'))
    const item = write.mock.calls[0][0][0] as { items: Record<string, Promise<Blob>> }
    expect(await (await item.items['text/html']).text()).toContain(MISSING_LABEL)
    expect(screen.queryByText(/첨부 순서/)).not.toBeInTheDocument()
  })

  it('클립보드 권한이 거부되면 안내 메시지를 보여 준다', async () => {
    const column = await createColumn()
    const user = userEvent.setup()
    const write = vi.fn(async () => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    render(<ExportButton editor={fakeEditor('<p>글</p>')} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    await user.click(screen.getByRole('button', { name: '서식 유지 복사' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('클립보드 권한')
  })

  it('Esc나 바깥 클릭으로 패널이 닫힌다', async () => {
    const column = await createColumn()
    const user = userEvent.setup()
    render(
      <>
        <ExportButton editor={fakeEditor('<p>글</p>')} columnId={column.id} />
        <p>바깥</p>
      </>,
    )
    const toggle = screen.getByRole('button', { name: '내보내기' })
    await user.click(toggle)
    expect(screen.getByRole('group', { name: '네이버 내보내기' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: '네이버 내보내기' })).not.toBeInTheDocument()
    await user.click(toggle)
    await user.click(screen.getByText('바깥'))
    expect(screen.queryByRole('group', { name: '네이버 내보내기' })).not.toBeInTheDocument()
  })

  it('이미지가 없으면 ZIP 내려받기가 안내 메시지를 보여 준다', async () => {
    const column = await createColumn()
    const user = userEvent.setup()
    render(<ExportButton editor={fakeEditor('<p>글만</p>')} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    await user.click(screen.getByRole('button', { name: '이미지 ZIP 내려받기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('내보낼 이미지가 없습니다')
  })

  it('폴더에 저장은 File System Access API가 있을 때만 보인다', async () => {
    const column = await createColumn()
    const user = userEvent.setup()
    const { unmount } = render(<ExportButton editor={fakeEditor('<p>글</p>')} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    expect(screen.queryByRole('button', { name: '폴더에 저장' })).not.toBeInTheDocument()
    unmount()

    vi.stubGlobal('showDirectoryPicker', vi.fn())
    render(<ExportButton editor={fakeEditor('<p>글</p>')} columnId={column.id} />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    expect(screen.getByRole('button', { name: '폴더에 저장' })).toBeInTheDocument()
  })
})
