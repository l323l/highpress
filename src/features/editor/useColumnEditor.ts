import { useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TACTIC_DRAG_MIME, type TacticDragPayload } from '@highpress/core/body'
import { STAT_BLOCK, type StatSnapshot } from '../stats'
import { createExtensions } from './extensions'
import { insertImageFiles, insertTactic } from './mediaInsert'
import type { MediaUrls } from './mediaUrls'
import { cleanPastedHtml, pastedHtmlHasText } from '@highpress/editor'
import { hasTacticPayload, parseTacticPayload } from './tacticDrop'
import { adoptForeignMedia } from './mediaRepair'
import { RESTORE_LIMIT, restoreTacticMedia } from './tacticRestore'

interface Options {
  columnId: string
  initialBody: JSONContent
  urls: MediaUrls
  // 에디터를 만들 때 한 번만 연결된다. ref처럼 바뀌지 않는 값만 읽어야 한다.
  onChange: (editor: Editor) => void
  // 본문 형식을 읽지 못해 편집을 잠갔을 때 한 번 불린다.
  onLocked: () => void
}

export interface ColumnEditor {
  editor: Editor
  // 모션그래픽을 만드는 중인지 (E-6)
  busy: boolean
  // 저장된 본문에 이 버전이 모르는 형식이 있어 읽기 전용으로 연 상태
  locked: boolean
  notice: string | null
  clearNotice: () => void
  insertFiles: (files: File[], pos?: number) => Promise<void>
  insertTacticPayload: (payload: TacticDragPayload, pos?: number) => Promise<void>
  insertStat: (snapshot: StatSnapshot) => void
}

export function useColumnEditor({ columnId, initialBody, urls, onChange, onLocked }: Options): ColumnEditor {
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const restoreBudget = useRef({ left: RESTORE_LIMIT })

  // 다른 칼럼의 미디어를 이 칼럼 몫으로 옮기고, 파일이 사라진 모션그래픽을 다시 만든다. 열 때와 붙여넣은 뒤에 돈다.
  const repairMedia = useCallback(
    async (editor: Editor) => {
      await adoptForeignMedia(editor, { columnId, urls })
      await restoreTacticMedia(editor, { columnId, urls }, restoreBudget.current)
    },
    [columnId, urls],
  )

  const insertFilesInto = useCallback(
    async (editor: Editor, files: File[], pos?: number) => {
      if (!editor.isEditable) return
      try {
        const errors = await insertImageFiles(editor, files, { columnId, urls }, pos)
        setNotice(errors.length > 0 ? errors.join(' ') : null)
      } catch {
        setNotice('이미지를 저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.')
      }
    },
    [columnId, urls],
  )

  const insertTacticPayload = useCallback(
    async (payload: TacticDragPayload, pos?: number) => {
      const editor = editorRef.current
      if (!editor || !editor.isEditable) return
      setBusy(true)
      setNotice(null)
      try {
        await insertTactic(editor, payload, { columnId, urls }, pos)
      } catch {
        setNotice('모션그래픽을 본문에 넣지 못했습니다. 다시 시도해 주세요.')
      } finally {
        setBusy(false)
      }
    },
    [columnId, urls],
  )

  const editor = useEditor(
    {
      extensions: createExtensions({
        resolveSrc: urls.get,
        onDropFiles: (ed, files, pos) => void insertFilesInto(ed, files, pos),
        onPasteFiles: (ed, files, html) => {
          if (!pastedHtmlHasText(html)) void insertFilesInto(ed, files)
        },
      }),
      content: initialBody,
      // 모르는 노드가 있으면 Tiptap이 그 부분을 버리고 연다. 그대로 저장되면 원본을 덮어쓰므로 잠근다.
      enableContentCheck: true,
      onContentError: ({ editor: ed }) => {
        ed.setEditable(false, false)
        onLocked()
        setLocked(true)
      },
      editorProps: {
        attributes: { class: 'prose', 'aria-label': '본문' },
        transformPastedHTML: cleanPastedHtml,
        handleDrop: (view, event) => {
          if (!hasTacticPayload(event.dataTransfer)) return false
          event.preventDefault()
          const payload = parseTacticPayload(event.dataTransfer!.getData(TACTIC_DRAG_MIME))
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          if (payload) void insertTacticPayload(payload, pos)
          else setNotice('끌어온 모션그래픽을 읽지 못했습니다.')
          return true
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        onChange(ed)
        if (transaction.getMeta('paste') || transaction.getMeta('uiEvent') === 'drop') void repairMedia(ed)
      },
    },
    [],
  )

  // 개발 모드(StrictMode)에서는 Tiptap이 에디터를 한 번 버리고 다시 만든다. 항상 지금 화면의 에디터를 가리키게 한다.
  useEffect(() => {
    editorRef.current = editor
    void repairMedia(editor)
  }, [editor, repairMedia])

  const insertFiles = useCallback((files: File[], pos?: number) => insertFilesInto(editor, files, pos), [editor, insertFilesInto])
  const clearNotice = useCallback(() => setNotice(null), [])

  // 커서 뒤에 스탯 도표를 넣는다. 방금 넣은 도표가 선택돼 있어도 그것을 갈아 끼우지 않는다.
  const insertStat = useCallback(
    (snapshot: StatSnapshot) => {
      if (!editor.isEditable) return
      const at = Math.min(editor.state.selection.to, editor.state.doc.content.size)
      editor.chain().focus().insertContentAt(at, { type: STAT_BLOCK, attrs: { snapshot } }).run()
    },
    [editor],
  )

  return { editor, busy, locked, notice, clearNotice, insertFiles, insertTacticPayload, insertStat }
}
