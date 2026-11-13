import type { Editor, JSONContent } from '@tiptap/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { createColumn, putMedia, updateColumn } from '../../db/store'
import type { TacticDragPayload } from '@highpress/core/body'
import { buildExportDocument } from '../export/exportDocument'
import { renderTactic } from '../tactics'
import { deleteOrphanMedia } from './bodyLoad'
import { EditorPage } from './index'
import { layoutModeFrom, PHONE_QUERY, STACK_QUERY } from './layoutMode'
import { insertTactic } from './mediaInsert'
import { createMediaUrls } from './mediaUrls'

// 탭을 처음 누를 때 뜨는 사용법 안내는 따로 시험한다 (TabGuide.test.tsx). 여기서는 화면을 가리지 않게 끈다.
vi.mock('./TabGuide', () => ({ TabGuide: () => null }))

vi.mock('../tactics', () => ({
  TacticsPane: ({ columnId, onInsert }: { columnId: string; onInsert?: (payload: TacticDragPayload) => void }) => (
    <div data-testid="tactics-pane" data-column-id={columnId}>
      <button type="button" onClick={() => onInsert?.({ projectId: 'project-1', format: 'gif' })}>
        본문에 넣기
      </button>
      <button type="button" onClick={() => onInsert?.({ projectId: 'project-1', format: 'png', sceneIndex: 5 })}>
        장면 넣기
      </button>
    </div>
  ),
  renderTactic: vi.fn(async () => new Blob(['gif'], { type: 'image/gif' })),
}))

// 영상 처리는 브라우저에서만 되므로 가짜 창으로 바꾼다. 누르면 GIF를 만든 것으로 친다.
vi.mock('../video', () => ({
  VideoPane: ({ session, onInsertFiles }: { session: unknown; onInsertFiles?: (files: File[]) => void }) => (
    <div data-testid="video-pane" data-loaded={session !== null}>
      <button type="button" onClick={() => onInsertFiles?.([new File(['gif'], '경기-편집.gif', { type: 'image/gif' })])}>
        영상 GIF 넣기
      </button>
    </div>
  ),
}))

// 스탯 조회는 서버가 필요하므로 창만 가짜로 바꾼다. 본문 노드(StatBlock)는 진짜를 쓴다.
vi.mock('../stats', async (original) => ({
  ...(await original<typeof import('../stats')>()),
  StatsPane: ({ onInsert }: { onInsert?: (snapshot: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onInsert?.({
          view: 'table',
          title: '프리미어리그 순위표',
          subtitle: '2026-27 시즌',
          source: 'football-data.org',
          fetchedAt: new Date(2026, 9, 9).getTime(),
          columns: ['순위', '팀', '승점'],
          rows: [[1, 'Man City', 15]],
        })
      }
    >
      가짜 스탯 넣기
    </button>
  ),
}))

// jsdom에는 blob: URL과 ProseMirror가 부르는 레이아웃 API가 없다.
let urlCount = 0
const createObjectURL = vi.fn(() => `blob:test/${++urlCount}`)
const revokeObjectURL = vi.fn()
Object.assign(URL, { createObjectURL, revokeObjectURL })
const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
Range.prototype.getClientRects = emptyRects
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = emptyRects
document.elementFromPoint = () => null
Element.prototype.scrollIntoView = () => {}

const png = () => new Blob(['png'], { type: 'image/png' })

async function mount(columnId: string) {
  const view = render(<EditorPage columnId={columnId} />)
  await screen.findByLabelText('제목')
  const editor = (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { ...view, editor }
}

const imagesOf = (doc: JSONContent) => (doc.content ?? []).filter((node) => node.type === 'image')

describe('EditorPage', () => {
  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.mocked(renderTactic).mockClear()
    window.location.hash = '#/write/x'
  })

  it('없는 칼럼이면 홈 링크를 보여 준다', async () => {
    render(<EditorPage columnId="missing" />)
    expect(await screen.findByText('칼럼을 찾을 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '#/')
  })

  it('기본은 글쓰기 창만, 모션 탭을 누르면 분할 창을 보여 준다', async () => {
    const column = await createColumn()
    await mount(column.id)
    expect(screen.queryByTestId('tactics-pane')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '모션' }))
    expect(screen.getByTestId('tactics-pane')).toHaveAttribute('data-column-id', column.id)
    expect(screen.getByRole('region', { name: '글쓰기' })).toBeInTheDocument()

    const divider = screen.getByRole('separator')
    fireEvent.keyDown(divider, { key: 'End' })
    expect(divider).toHaveAttribute('aria-valuenow', '75')
    await waitFor(async () => expect((await db.settings.get('splitRatio'))?.value).toBe(0.75))

    fireEvent.click(screen.getByRole('tab', { name: '글쓰기' }))
    expect(screen.queryByTestId('tactics-pane')).not.toBeInTheDocument()
  })

  describe('화면 크기에 따른 나눔', () => {
    // jsdom 에는 matchMedia 가 없다. 고른 조건만 맞는 것으로 답하는 가짜를 둔다.
    const pretend = (matching: string[]) => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: matching.includes(query), addEventListener: () => {}, removeEventListener: () => {} }))
    }
    afterEach(() => vi.unstubAllGlobals())

    it('핸드폰이 먼저다: 좁으면 나누지 않고, 세로로 든 패드는 위아래, 나머지는 좌우로 나눈다', () => {
      expect(layoutModeFrom(true, true)).toBe('single')
      expect(layoutModeFrom(true, false)).toBe('single')
      expect(layoutModeFrom(false, true)).toBe('stack')
      expect(layoutModeFrom(false, false)).toBe('side')
    })

    it('핸드폰에서는 탭 하나만 보이고, 본문에 넣으면 글쓰기로 돌아온다', async () => {
      pretend([PHONE_QUERY, STACK_QUERY])
      const column = await createColumn()
      const { editor } = await mount(column.id)
      const writing = screen.getByRole('region', { name: '글쓰기' })
      expect(writing).toBeVisible()

      fireEvent.click(screen.getByRole('tab', { name: '영상' }))
      expect(screen.getByTestId('video-pane')).toBeInTheDocument()
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
      // 글쓰기 창은 지우지 않고 숨긴다. 쓰던 글이 남아 있어야 한다.
      expect(writing).not.toBeVisible()
      expect(document.querySelector('.ProseMirror')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '영상 GIF 넣기' }))
      await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(1))
      expect(screen.getByRole('tab', { name: '글쓰기' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByTestId('video-pane')).not.toBeInTheDocument()
      expect(writing).toBeVisible()
    })

    it('세로로 든 패드에서는 위아래로 나누고 경계선을 위아래 화살표로 옮긴다', async () => {
      pretend([STACK_QUERY])
      const column = await createColumn()
      await mount(column.id)
      fireEvent.click(screen.getByRole('tab', { name: '모션' }))
      expect(screen.getByRole('region', { name: '글쓰기' })).toBeVisible()
      const divider = screen.getByRole('separator')
      expect(divider).toHaveAttribute('aria-orientation', 'horizontal')
      const before = Number(divider.getAttribute('aria-valuenow'))
      fireEvent.keyDown(divider, { key: 'ArrowDown' })
      expect(Number(divider.getAttribute('aria-valuenow'))).toBe(before + 2)
      // 본문에 넣어도 두 창이 다 보이니 탭을 바꾸지 않는다.
      fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))
      expect(screen.getByRole('tab', { name: '모션' })).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('영상 탭을 누르면 분할 창에 영상 편집을 보여 주고, 만든 GIF를 본문에 넣는다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    fireEvent.click(screen.getByRole('tab', { name: '영상' }))
    expect(screen.getByTestId('video-pane')).toHaveAttribute('data-loaded', 'false')
    expect(screen.queryByTestId('tactics-pane')).not.toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '영상 GIF 넣기' }))
    await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(1))
    const media = await db.media.where('columnId').equals(column.id).toArray()
    expect(media).toHaveLength(1)
    // 사용자가 만든 결과물이라 다시 만들 수 없다. 임시 미디어가 아니라 본문 사진처럼 보관한다.
    expect(media[0]).toMatchObject({ kind: 'gif', temp: false, name: '경기-편집.gif' })
  })

  it('스탯 탭에서 고른 도표가 본문에 들어가고, 저장·복사에는 표로 실린다', async () => {
    const snapshot = {
      view: 'table',
      title: '프리미어리그 순위표',
      subtitle: '2026-27 시즌',
      source: 'football-data.org',
      fetchedAt: new Date(2026, 9, 9).getTime(),
      columns: ['순위', '팀', '승점'],
      rows: [[1, 'Man City', 15]],
    }
    const column = await createColumn()
    const { editor } = await mount(column.id)
    fireEvent.click(screen.getByRole('tab', { name: '스탯' }))
    expect(screen.getByRole('separator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가짜 스탯 넣기' }))

    // 본문에는 조회 시점의 값이 그대로 들어간다 (S-5).
    const node = (editor.getJSON().content ?? []).find((item) => item.type === 'statBlock')
    expect(node?.attrs?.snapshot).toEqual(snapshot)
    // 화면에는 도표로 보인다.
    expect(await screen.findByText('출처: football-data.org · 2026.10.09 기준')).toBeInTheDocument()

    // HTML로는 제목 · 표 · 출처다. 네이버 내보내기가 이 HTML을 쓴다.
    const exported = buildExportDocument(editor.getHTML(), () => undefined)
    const doc = new DOMParser().parseFromString(exported.html, 'text/html')
    expect(doc.querySelector('strong')?.textContent).toBe('프리미어리그 순위표')
    expect(Array.from(doc.querySelectorAll('th')).map((cell) => cell.textContent)).toEqual(['순위', '팀', '승점'])
    expect(Array.from(doc.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual(['1', 'Man City', '15'])
    expect(exported.html).toContain('출처: football-data.org')
    expect(exported.html).not.toContain('data-stat-block')

    // 저장했다가 다시 읽어도 같은 도표다.
    editor.commands.setContent(editor.getHTML())
    expect((editor.getJSON().content ?? []).find((item) => item.type === 'statBlock')?.attrs?.snapshot).toEqual(snapshot)
  })

  it('형식이 깨진 스탯 도표는 내용을 그리지 않고 자리만 표시한다', async () => {
    const column = await createColumn()
    await updateColumn(column.id, { body: { type: 'doc', content: [{ type: 'statBlock', attrs: { snapshot: { view: 'table', rows: 'x' } } }] } })
    await mount(column.id)
    expect(await screen.findByText('읽을 수 없는 스탯 도표')).toBeInTheDocument()
  })

  it('본문·제목을 기기에 저장하고 미디어 src는 비운다', async () => {
    const column = await createColumn()
    const media = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: png(), name: 'a.png' })
    await updateColumn(column.id, {
      body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: media.id } }, { type: 'paragraph' }] },
    })
    const { editor } = await mount(column.id)

    const hydrated = imagesOf(editor.getJSON())[0]
    expect(hydrated.attrs?.src).toMatch(/^blob:test\//)
    expect(hydrated.attrs?.mediaId).toBe(media.id)

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '손흥민의 왼발' } })
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>첫 문단</p>')
    fireEvent.click(screen.getByRole('button', { name: '임시저장' }))

    await waitFor(async () => expect((await db.columns.get(column.id))?.title).toBe('손흥민의 왼발'))
    const saved = (await db.columns.get(column.id))!
    expect(saved.status).toBe('draft')
    expect(JSON.stringify(saved.body)).toContain('첫 문단')
    expect(JSON.stringify(saved.body)).not.toContain('blob:')
    expect(imagesOf(saved.body)[0].attrs).toMatchObject({ src: null, mediaId: media.id })
    expect(await screen.findByText(/^자동 저장됨 \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('변경 뒤 3초 안에 자동 저장한다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    editor.commands.insertContent('자동 저장 확인')
    await waitFor(async () => expect(JSON.stringify((await db.columns.get(column.id))?.body)).toContain('자동 저장 확인'), {
      timeout: 3000,
    })
  })

  it('화면을 떠날 때 남은 변경을 저장하고 blob URL을 해제한다', async () => {
    const column = await createColumn()
    const media = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: png(), name: 'a.png' })
    await updateColumn(column.id, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: media.id } }] } })
    const { editor, unmount } = await mount(column.id)
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>떠나기 직전</p>')
    unmount()
    await waitFor(async () => expect(JSON.stringify((await db.columns.get(column.id))?.body)).toContain('떠나기 직전'))
    expect(revokeObjectURL).toHaveBeenCalledWith(createObjectURL.mock.results[0].value)
  })

  it('탭이 숨겨지면 바로 저장한다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    editor.commands.insertContent('숨김 저장')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockRestore()
    await waitFor(async () => expect(JSON.stringify((await db.columns.get(column.id))?.body)).toContain('숨김 저장'), { timeout: 500 })
  })

  it('저장을 누르면 저장됨 상태로 홈으로 간다. 게시 링크가 있으면 게시됨', async () => {
    const column = await createColumn()
    await mount(column.id)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect((await db.columns.get(column.id))?.status).toBe('saved')
  })

  it('게시된 글 링크는 http/https만 기록한다', async () => {
    const column = await createColumn()
    await mount(column.id)
    const input = screen.getByLabelText('게시된 글 링크')
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
    expect(screen.getByText('http:// 또는 https:// 주소만 넣을 수 있습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await screen.findByText(/^자동 저장됨/)
    expect((await db.columns.get(column.id))?.publishedUrl).toBe('')

    fireEvent.change(input, { target: { value: 'https://cafe.naver.com/soccer/1' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(await db.columns.get(column.id)).toMatchObject({ status: 'published', publishedUrl: 'https://cafe.naver.com/soccer/1' })
  })

  it('팀 태그를 고르거나 새로 만든다', async () => {
    const column = await createColumn()
    await db.teams.add({ id: 'team-1', name: '토트넘', color: '#132257' })
    await mount(column.id)
    await screen.findByRole('option', { name: '토트넘' })
    fireEvent.change(screen.getByLabelText('팀 태그'), { target: { value: 'team-1' } })
    fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(async () => expect((await db.columns.get(column.id))?.teamId).toBe('team-1'))

    fireEvent.change(screen.getByLabelText('팀 태그'), { target: { value: '__new__' } })
    fireEvent.change(screen.getByLabelText('새 팀 이름'), { target: { value: '울산' } })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(async () => expect(await db.teams.count()).toBe(2))
    const created = (await db.teams.toArray()).find((t) => t.name === '울산')!
    fireEvent.click(await screen.findByRole('button', { name: '임시저장' }))
    await waitFor(async () => expect((await db.columns.get(column.id))?.teamId).toBe(created.id))
  })

  it('이 기기에 파일이 없는 미디어는 자리표시로 보여 준다', async () => {
    const column = await createColumn()
    await updateColumn(column.id, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: 'gone' } }] } })
    await mount(column.id)
    expect(screen.getByRole('img', { name: '이 기기에 없는 미디어' })).toBeInTheDocument()
    expect(document.querySelector('.ProseMirror img')).toBeNull()
  })

  it('이미지 파일은 형식을 확인해 기기에 저장하고 본문에 넣는다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    const good = new File(['png'], 'photo.png', { type: 'image/png' })
    const svg = new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })
    fireEvent.change(screen.getByLabelText('이미지 파일 선택'), { target: { files: [good, svg] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('bad.svg')
    const stored = await db.media.where('columnId').equals(column.id).toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ name: 'photo.png', temp: false, kind: 'image' })
    await waitFor(() => expect(imagesOf(editor.getJSON())[0]?.attrs?.mediaId).toBe(stored[0].id))
  })

  it('모션그래픽을 렌더링해 임시 미디어로 저장하고 본문에 넣는다', async () => {
    const column = await createColumn()
    await db.tacticProjects.add({
      id: 'project-1',
      columnId: column.id,
      teamColors: { a: '#ff0000', b: '#0000ff' },
      tokens: [],
      scenes: [],
      updatedAt: Date.now(),
    })
    const { editor } = await mount(column.id)
    fireEvent.click(screen.getByRole('tab', { name: '모션' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))

    await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(1))
    const [media] = await db.media.where('columnId').equals(column.id).toArray()
    expect(media).toMatchObject({ kind: 'gif', temp: true, tacticProjectId: 'project-1' })
    expect(imagesOf(editor.getJSON())[0].attrs).toMatchObject({ mediaId: media.id, tacticProjectId: 'project-1' })
  })

  // 개발 서버는 StrictMode로 효과를 두 번 실행한다. 그때도 살아 있는 에디터에 넣어야 한다.
  it('StrictMode에서도 모션그래픽이 본문에 들어간다', async () => {
    const column = await createColumn()
    await db.tacticProjects.add({
      id: 'project-1',
      columnId: column.id,
      teamColors: { a: '#ff0000', b: '#0000ff' },
      tokens: [],
      scenes: [],
      updatedAt: Date.now(),
    })
    render(
      <StrictMode>
        <EditorPage columnId={column.id} />
      </StrictMode>,
    )
    await screen.findByLabelText('제목')
    fireEvent.click(screen.getByRole('tab', { name: '모션' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))

    await waitFor(() => expect(document.querySelectorAll('.ProseMirror img')).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('모션그래픽 프로젝트가 없으면 안내 메시지를 보여 준다', async () => {
    const column = await createColumn()
    await mount(column.id)
    fireEvent.click(screen.getByRole('tab', { name: '모션' }))
    fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('모션그래픽을 본문에 넣지 못했습니다')
  })

  it('붙여넣은 HTML에서 스크립트와 위험한 링크를 걸러 낸다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    const html = '<p>본문<script>alert(1)</script></p><p><a href="javascript:alert(1)">나쁜 링크</a></p><img src="https://evil.example/a.png">'
    editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent)
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('본문')
    expect(json).not.toMatch(/alert|javascript:|evil\.example/)
  })

  it('줄간격을 문단에 걸고 선택 상자에 현재 값을 보여 준다', async () => {
    const column = await createColumn()
    const { editor } = await mount(column.id)
    editor.commands.setContent('<p>첫 문단</p><p>둘째 문단</p>')
    editor.commands.setTextSelection(2)
    const select = screen.getByLabelText('줄간격') as HTMLSelectElement

    fireEvent.change(select, { target: { value: '1.2' } })
    const [first, second] = editor.getJSON().content!
    expect(first.attrs?.lineHeight).toBe('1.2')
    expect(second.attrs?.lineHeight ?? null).toBeNull()
    expect((document.querySelector('.ProseMirror p') as HTMLElement).style.lineHeight).toBe('1.2')
    await waitFor(() => expect(select.value).toBe('1.2'))
    expect(JSON.stringify(editor.getJSON())).not.toContain('textStyle')

    fireEvent.change(select, { target: { value: '' } })
    expect(editor.getJSON().content![0].attrs?.lineHeight ?? null).toBeNull()
    await waitFor(() => expect(select.value).toBe(''))
  })

  it('저장된 줄간격 값이 숫자 꼴이 아니면 style에 넣지 않는다', async () => {
    const column = await createColumn()
    await updateColumn(column.id, {
      body: { type: 'doc', content: [{ type: 'paragraph', attrs: { lineHeight: '1;background:url(https://evil.example)' } }] },
    })
    await mount(column.id)
    expect(document.querySelector('.ProseMirror p')?.getAttribute('style') ?? '').not.toContain('evil')
  })

  describe('모션그래픽', () => {
    const addProject = (columnId: string) =>
      db.tacticProjects.add({
        id: 'project-1',
        columnId,
        teamColors: { a: '#ff0000', b: '#0000ff' },
        tokens: [],
        scenes: [
          { id: 's1', positions: {}, durationMs: 1000 },
          { id: 's2', positions: {}, durationMs: 1000 },
        ],
        updatedAt: Date.now(),
      })

    it('고른 장면을 그리고, 장면 번호는 프로젝트 범위로 맞춘다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      const { editor } = await mount(column.id)
      fireEvent.click(screen.getByRole('tab', { name: '모션' }))
      fireEvent.click(screen.getByRole('button', { name: '장면 넣기' }))
      await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(1))
      expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'png', { sceneIndex: 1 })
    })

    it('렌더링하는 동안 본문이 바뀌어도 놓은 자리에 넣는다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      const { editor } = await mount(column.id)
      editor.commands.setContent('<p>첫</p><p>둘</p>')
      let finish!: (blob: Blob) => void
      vi.mocked(renderTactic).mockImplementationOnce(() => new Promise<Blob>((resolve) => (finish = resolve)))

      // 3 = 두 문단 사이
      const inserting = insertTactic(editor, { projectId: 'project-1', format: 'png' }, { columnId: column.id, urls: createMediaUrls() }, 3)
      await waitFor(() => expect(renderTactic).toHaveBeenCalled())
      editor.commands.insertContentAt(1, '추가')
      finish(png())
      await inserting

      const content = editor.getJSON().content!
      expect(content.map((node) => node.type)).toEqual(['paragraph', 'image', 'paragraph'])
      expect(content[0].content).toEqual([{ type: 'text', text: '추가첫' }])
    })

    const missingBody = (attrs: Record<string, unknown> = {}): JSONContent => ({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: null, mediaId: 'gone', tacticProjectId: 'project-1', ...attrs } }, { type: 'paragraph' }],
    })

    it('넣을 때 형식과 장면을 노드에 적어 둔다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      const { editor } = await mount(column.id)
      fireEvent.click(screen.getByRole('tab', { name: '모션' }))
      fireEvent.click(screen.getByRole('button', { name: '장면 넣기' }))
      await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(1))
      expect(imagesOf(editor.getJSON())[0].attrs).toMatchObject({ tacticFormat: 'png', tacticSceneIndex: 1 })
      const img = document.querySelector('.ProseMirror img')!
      expect(img.getAttribute('data-tactic-format')).toBe('png')
      expect(img.getAttribute('data-tactic-scene-index')).toBe('1')

      fireEvent.click(screen.getByRole('button', { name: '본문에 넣기' }))
      await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(2))
      expect(imagesOf(editor.getJSON()).map((node) => node.attrs?.tacticFormat).sort()).toEqual(['gif', 'png'])
    })

    it('파일이 사라진 모션그래픽은 칼럼을 먼저 연 뒤 다시 만들어 끼우고, 자동 저장으로 기록한다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      await updateColumn(column.id, { body: missingBody() })
      let finish!: (blob: Blob) => void
      vi.mocked(renderTactic).mockImplementationOnce(() => new Promise<Blob>((resolve) => (finish = resolve)))
      const { editor } = await mount(column.id)

      // 렌더링이 끝나기 전에도 칼럼은 열려 있고 자리표시가 보인다.
      expect(screen.getByRole('img', { name: '이 기기에 없는 미디어' })).toBeInTheDocument()
      await waitFor(() => expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'png', { sceneIndex: 0 }))
      // 그 사이 다른 탭이 저장한 내용을 덮어쓰지 않는다: 렌더링 중에는 본문을 쓰지 않는다.
      expect(imagesOf((await db.columns.get(column.id))!.body)[0].attrs?.mediaId).toBe('gone')
      finish(png())

      await waitFor(() => expect(imagesOf(editor.getJSON())[0].attrs?.src).toMatch(/^blob:test\//))
      const [media] = await db.media.where('columnId').equals(column.id).toArray()
      expect(media).toMatchObject({ kind: 'image', temp: true, tacticProjectId: 'project-1' })
      expect(imagesOf(editor.getJSON())[0].attrs?.mediaId).toBe(media.id)
      expect(screen.queryByRole('img', { name: '이 기기에 없는 미디어' })).not.toBeInTheDocument()
      await waitFor(
        async () => expect(imagesOf((await db.columns.get(column.id))!.body)[0].attrs).toMatchObject({ src: null, mediaId: media.id }),
        { timeout: 3000 },
      )
    })

    it('미디어 기록이 없어도 노드에 적힌 형식과 장면으로 다시 만든다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      await updateColumn(column.id, { body: missingBody({ tacticFormat: 'gif' }) })
      const first = await mount(column.id)
      await waitFor(() => expect(imagesOf(first.editor.getJSON())[0].attrs?.src).toBeTruthy())
      expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'gif', { sceneIndex: 0 })
      expect((await db.media.toArray())[0].kind).toBe('gif')
      first.unmount()

      vi.mocked(renderTactic).mockClear()
      const other = await createColumn()
      await db.tacticProjects.update('project-1', { columnId: other.id })
      await updateColumn(other.id, { body: missingBody({ tacticFormat: 'png', tacticSceneIndex: 7 }) })
      const second = await mount(other.id)
      await waitFor(() => expect(imagesOf(second.editor.getJSON())[0].attrs?.src).toBeTruthy())
      expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'png', { sceneIndex: 1 })
    })

    it('노드에 적힌 형식이 올바르지 않으면 남아 있는 기록을 보고, 없으면 그림으로 만든다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      const old = await putMedia({ columnId: column.id, kind: 'gif', temp: true, blob: png(), name: 'old.gif', tacticProjectId: 'project-1' })
      // OPFS 파일만 사라진 상태
      await db.media.update(old.id, { blob: undefined, opfsPath: 'media-lost' })
      await updateColumn(column.id, {
        body: {
          type: 'doc',
          content: [
            { type: 'image', attrs: { src: null, mediaId: old.id, tacticProjectId: 'project-1' } },
            { type: 'image', attrs: { src: null, mediaId: 'gone', tacticProjectId: 'project-1', tacticFormat: 'mp4', tacticSceneIndex: -3 } },
          ],
        },
      })
      const { editor } = await mount(column.id)
      await waitFor(() => expect(imagesOf(editor.getJSON()).every((node) => node.attrs?.src)).toBe(true))
      expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'gif', { sceneIndex: 0 })
      expect(renderTactic).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), 'png', { sceneIndex: 0 })
    })

    it('다시 만들지 못해도 칼럼은 열리고 자리표시를 보여 준다', async () => {
      const column = await createColumn()
      await addProject(column.id)
      await updateColumn(column.id, { body: missingBody() })
      vi.mocked(renderTactic).mockRejectedValueOnce(new Error('canvas'))
      await mount(column.id)
      await waitFor(() => expect(renderTactic).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(screen.getByRole('img', { name: '이 기기에 없는 미디어' })).toBeInTheDocument()
      expect(await db.media.count()).toBe(0)
    })
  })

  describe('모션그래픽 다시 만들기 한도', () => {
    const project = (columnId: string) =>
      db.tacticProjects.add({ id: 'project-1', columnId, teamColors: { a: '#ff0000', b: '#0000ff' }, tokens: [], scenes: [], updatedAt: Date.now() })
    const placeholder = (mediaId: string, attrs: Record<string, unknown> = {}): JSONContent => ({
      type: 'image',
      attrs: { src: null, mediaId, tacticProjectId: 'project-1', ...attrs },
    })
    const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

    it('같은 그림은 한 번만 만들어 함께 쓴다', async () => {
      const column = await createColumn()
      await project(column.id)
      await updateColumn(column.id, { body: { type: 'doc', content: [1, 2, 3, 4, 5].map((i) => placeholder(`gone-${i}`, { tacticFormat: 'gif' })) } })
      const { editor } = await mount(column.id)
      await waitFor(() => expect(imagesOf(editor.getJSON()).every((node) => node.attrs?.src)).toBe(true))
      expect(renderTactic).toHaveBeenCalledTimes(1)
      expect(await db.media.count()).toBe(1)
      expect(new Set(imagesOf(editor.getJSON()).map((node) => node.attrs?.mediaId)).size).toBe(1)
    })

    it('한 번 여는 동안 20개까지만 다시 만든다', async () => {
      const column = await createColumn()
      await project(column.id)
      const content = Array.from({ length: 25 }, (_, i) => placeholder(`gone-${i}`, { tacticFormat: 'png', tacticSceneIndex: i }))
      await updateColumn(column.id, { body: { type: 'doc', content } })
      const { editor } = await mount(column.id)
      await waitFor(() => expect(renderTactic).toHaveBeenCalledTimes(20))
      await settle()
      expect(renderTactic).toHaveBeenCalledTimes(20)
      expect(await db.media.count()).toBe(20)
      expect(imagesOf(editor.getJSON()).filter((node) => !node.attrs?.src)).toHaveLength(5)
    })

    it('식별자 모양이 아닌 값은 다시 만들지 않는다', async () => {
      const column = await createColumn()
      await project(column.id)
      await updateColumn(column.id, {
        body: { type: 'doc', content: [placeholder('bad id!'), placeholder('gone', { tacticProjectId: '../project-1' }), placeholder('x'.repeat(65))] },
      })
      await mount(column.id)
      await settle()
      expect(renderTactic).not.toHaveBeenCalled()
      expect(await db.media.count()).toBe(0)
    })
  })

  describe('다른 칼럼의 미디어', () => {
    it('열 때 이 칼럼 몫으로 복사해 연결을 바꾼다', async () => {
      const source = await createColumn()
      const column = await createColumn()
      const foreign = await putMedia({ columnId: source.id, kind: 'image', temp: false, blob: png(), name: 'shared.png' })
      await updateColumn(column.id, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: foreign.id } }] } })
      const { editor } = await mount(column.id)

      await waitFor(() => expect(imagesOf(editor.getJSON())[0].attrs?.mediaId).not.toBe(foreign.id))
      const own = await db.media.where('columnId').equals(column.id).toArray()
      expect(own).toHaveLength(1)
      expect(own[0]).toMatchObject({ name: 'shared.png', temp: false, kind: 'image' })
      expect(imagesOf(editor.getJSON())[0].attrs).toMatchObject({ mediaId: own[0].id, src: expect.stringMatching(/^blob:test\//) })
      expect(await db.media.get(foreign.id)).toBeDefined()
    })

    it('붙여넣은 이미지도 이 칼럼 몫으로 복사한다', async () => {
      const source = await createColumn()
      const column = await createColumn()
      const foreign = await putMedia({ columnId: source.id, kind: 'image', temp: false, blob: png(), name: 'shared.png' })
      const { editor } = await mount(column.id)
      editor.view.pasteHTML(`<img src="blob:other-tab/1" data-media-id="${foreign.id}">`, new Event('paste') as ClipboardEvent)

      await waitFor(async () => expect(await db.media.where('columnId').equals(column.id).count()).toBe(1))
      const [own] = await db.media.where('columnId').equals(column.id).toArray()
      await waitFor(() => expect(imagesOf(editor.getJSON())[0]?.attrs?.mediaId).toBe(own.id))
      expect(JSON.stringify(editor.getJSON())).not.toContain(foreign.id)
    })

    it('파일을 읽을 수 없으면 노드를 지운다', async () => {
      const source = await createColumn()
      const column = await createColumn()
      const foreign = await putMedia({ columnId: source.id, kind: 'image', temp: false, blob: png(), name: 'lost.png' })
      await db.media.update(foreign.id, { blob: undefined, opfsPath: 'media-lost' })
      await updateColumn(column.id, {
        body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: foreign.id } }, { type: 'paragraph', content: [{ type: 'text', text: '글' }] }] },
      })
      const { editor } = await mount(column.id)
      await waitFor(() => expect(imagesOf(editor.getJSON())).toHaveLength(0))
      expect(JSON.stringify(editor.getJSON())).toContain('글')
      expect(await db.media.where('columnId').equals(column.id).count()).toBe(0)
    })
  })

  describe('안 쓰는 미디어 정리', () => {
    const OLD = Date.now() - 11 * 60 * 1000

    it('칼럼을 열 때 본문에 없는 오래된 미디어만 지운다', async () => {
      const column = await createColumn()
      const other = await createColumn()
      const add = (columnId: string, name: string) => putMedia({ columnId, kind: 'image', temp: false, blob: png(), name })
      const used = await add(column.id, 'used.png')
      const orphan = await add(column.id, 'orphan.png')
      await add(column.id, 'recent.png')
      const foreign = await add(other.id, 'foreign.png')
      await db.media.bulkUpdate([used, orphan, foreign].map((m) => ({ key: m.id, changes: { createdAt: OLD } })))
      await updateColumn(column.id, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: null, mediaId: used.id } }] } })

      await mount(column.id)
      const left = (await db.media.toArray()).map((m) => m.name).sort()
      expect(left).toEqual(['foreign.png', 'recent.png', 'used.png'])
    })

    it('지운 개수를 돌려준다', async () => {
      const column = await createColumn()
      const media = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: png(), name: 'a.png' })
      expect(await deleteOrphanMedia(column.id, column.body)).toBe(0)
      expect(await deleteOrphanMedia(column.id, column.body, Date.now() + 11 * 60 * 1000)).toBe(1)
      expect(await db.media.get(media.id)).toBeUndefined()
    })
  })

  describe('읽을 수 없는 본문', () => {
    it('모르는 노드가 있으면 잠근 채로 열고 저장된 본문을 덮어쓰지 않는다', async () => {
      const column = await createColumn()
      const body: JSONContent = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '원본 문단' }] },
          { type: 'iframe', attrs: { src: 'https://evil.example' } },
        ],
      }
      await updateColumn(column.id, { body })
      const { editor, unmount } = await mount(column.id)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '이 칼럼의 본문 형식을 읽을 수 없어 편집을 잠갔습니다. 원본은 그대로 보관됩니다.',
      )
      expect(editor.isEditable).toBe(false)
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
      expect(document.querySelector('iframe')).toBeNull()

      editor.commands.insertContent('덮어쓰기')
      fireEvent.change(screen.getByLabelText('제목'), { target: { value: '제목만 바뀜' } })
      fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
      await waitFor(async () => expect((await db.columns.get(column.id))?.title).toBe('제목만 바뀜'))
      expect((await db.columns.get(column.id))?.body).toEqual(body)

      unmount()
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect((await db.columns.get(column.id))?.body).toEqual(body)
    })
  })

  describe('링크 속성', () => {
    const expectSafeLink = () => {
      const link = document.querySelector('.ProseMirror a') as HTMLAnchorElement
      expect(link.getAttribute('href')).toBe('https://example.com/')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
      expect(link.getAttribute('class') ?? '').not.toMatch(/fab|btn/)
    }

    it('붙여넣은 링크의 class·rel·target을 받지 않는다', async () => {
      const column = await createColumn()
      const { editor } = await mount(column.id)
      editor.view.pasteHTML(
        '<p><a href="https://example.com/" class="fab btn-primary" rel="opener" target="_top">가짜 버튼</a></p>',
        new Event('paste') as ClipboardEvent,
      )
      expectSafeLink()
      expect(JSON.stringify(editor.getJSON())).not.toMatch(/fab|opener"|_top/)
    })

    it('저장된 본문의 링크 속성도 기본값으로 다시 그린다', async () => {
      const column = await createColumn()
      const marks = [{ type: 'link', attrs: { href: 'https://example.com/', class: 'fab btn-primary', rel: 'opener', target: '_top' } }]
      await updateColumn(column.id, {
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '가짜 버튼', marks }] }] },
      })
      await mount(column.id)
      expectSafeLink()
    })

    it('저장된 본문의 위험한 링크 주소는 그리지 않는다', async () => {
      const column = await createColumn()
      const marks = [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
      await updateColumn(column.id, {
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '나쁜 링크', marks }] }] },
      })
      await mount(column.id)
      expect(document.querySelector('.ProseMirror a')?.getAttribute('href') ?? '').not.toContain('javascript')
    })
  })

  describe('다른 탭에서 칼럼이 지워진 경우', () => {
    it('저장 실패를 알리고 홈으로 가지 않는다', async () => {
      const column = await createColumn()
      await mount(column.id)
      await db.columns.delete(column.id)

      fireEvent.change(screen.getByLabelText('제목'), { target: { value: '사라진 글' } })
      fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
      expect(await screen.findByText('저장하지 못했습니다 — 칼럼이 삭제되어 저장할 수 없습니다.')).toBeInTheDocument()
      expect(screen.queryByText(/자동 저장됨/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '저장' }))
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(window.location.hash).toBe('#/write/x')
      expect(screen.getByText(/^저장하지 못했습니다/)).toBeInTheDocument()
    })

    it('홈 버튼은 저장하지 않고 나갈지 물어본다', async () => {
      const column = await createColumn()
      await mount(column.id)
      await db.columns.delete(column.id)
      fireEvent.change(screen.getByLabelText('제목'), { target: { value: '사라진 글' } })
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

      fireEvent.click(screen.getByRole('button', { name: '홈으로' }))
      await waitFor(() => expect(confirm).toHaveBeenCalledWith('저장하지 못했습니다. 저장하지 않고 나갈까요?'))
      expect(window.location.hash).toBe('#/write/x')

      confirm.mockReturnValue(true)
      fireEvent.click(screen.getByRole('button', { name: '홈으로' }))
      await waitFor(() => expect(window.location.hash).toBe('#/'))
      confirm.mockRestore()
    })

    it('저장에 성공하면 묻지 않고 홈으로 간다', async () => {
      const column = await createColumn()
      await mount(column.id)
      const confirm = vi.spyOn(window, 'confirm')
      fireEvent.click(screen.getByRole('button', { name: '홈으로' }))
      await waitFor(() => expect(window.location.hash).toBe('#/'))
      expect(confirm).not.toHaveBeenCalled()
      confirm.mockRestore()
    })
  })
})
