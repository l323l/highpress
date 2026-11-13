import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../db/db'
import { getMediaBlob } from '../../db/store'
import { downloadBlob } from '../../lib/download'
import { NaverPostPanel } from '../naver/NaverPostPanel'
import { buildExportDocument, type ExportDocument } from './exportDocument'
import { buildZip, canSaveToFolder, loadExportEntries, saveToFolder, type ExportEntry } from './exportMedia'
import './export.css'

interface Props {
  editor: Editor | null
  columnId: string
}

interface Notice {
  text: string
  error: boolean
}

// 파일을 실제로 읽을 수 있는 미디어에만 번호를 준다. 자리표시가 ZIP에 없는 파일을 가리키지 않게 하기 위해서다.
async function currentDocument(html: string, columnId: string): Promise<ExportDocument> {
  const media = await db.media.where('columnId').equals(columnId).toArray()
  const mimes = new Map<string, string>()
  for (const m of media) {
    if (await getMediaBlob(m.id)) mimes.set(m.id, m.mime)
  }
  return buildExportDocument(html, (id) => mimes.get(id))
}

// Safari는 클릭 처리 중에 바로 write를 불러야 하므로, 문서가 준비되기 전에 약속(Promise)을 넘긴다.
function writeClipboard(doc: Promise<ExportDocument>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return Promise.reject(new Error('이 브라우저는 서식 복사를 지원하지 않습니다. Chrome이나 Edge에서 열어 주세요.'))
  }
  return navigator.clipboard.write([
    new ClipboardItem({
      'text/html': doc.then((d) => new Blob([d.html], { type: 'text/html' })),
      'text/plain': doc.then((d) => new Blob([d.text], { type: 'text/plain' })),
    }),
  ])
}

// 네이버 블로그·카페 복사·붙여넣기 내보내기 (N-7).
export function ExportButton({ editor, columnId }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fileNames, setFileNames] = useState<string[] | null>(null)
  // 같은 틱의 두 번 클릭을 막는다 (state는 다음 렌더에야 바뀐다).
  const running = useRef(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const run = async (action: (doc: Promise<ExportDocument>) => Promise<string | null>) => {
    if (!editor || running.current) return
    running.current = true
    setBusy(true)
    setNotice(null)
    try {
      const pending = currentDocument(editor.getHTML(), columnId)
      const text = await action(pending)
      const doc = await pending
      setFileNames(doc.files.map((file) => file.name))
      if (text) setNotice({ text: doc.missing ? `${text} 파일이 없는 이미지 ${doc.missing}개는 빠졌습니다.` : text, error: false })
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      const text = denied ? '클립보드에 쓸 수 없습니다. 브라우저의 클립보드 권한을 확인해 주세요.' : error instanceof Error ? error.message : ''
      setNotice({ text: text || '내보내지 못했습니다.', error: true })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const copy = () =>
    run(async (doc) => {
      await writeClipboard(doc)
      return '복사했습니다. 네이버 글쓰기 화면에 붙여넣으세요.'
    })

  const withEntries = (save: (entries: ExportEntry[]) => Promise<string | null>) =>
    run(async (doc) => {
      const entries = await loadExportEntries((await doc).files)
      if (entries.length === 0) throw new Error('내보낼 이미지가 없습니다.')
      return save(entries)
    })

  const zip = () =>
    withEntries(async (entries) => {
      downloadBlob(await buildZip(entries), 'column-media.zip')
      return `이미지 ${entries.length}개를 ZIP으로 내려받았습니다.`
    })

  const folder = () =>
    withEntries(async (entries) => {
      const saved = await saveToFolder(entries)
      return saved === null ? null : `이미지 ${saved}개를 폴더에 저장했습니다.`
    })

  return (
    <div className="export" ref={root}>
      <button type="button" className="btn" aria-expanded={open} aria-controls="export-panel" disabled={!editor} onClick={() => setOpen(!open)}>
        내보내기
      </button>
      {open && (
        <div id="export-panel" className="export__panel card" role="group" aria-label="네이버 내보내기">
          <p className="export__hint">
            네이버 블로그·카페에는 글만 붙여넣어집니다. 이미지와 모션그래픽은 본문의 <b>[이미지 번호]</b> 자리에 같은 번호의 파일을 첨부하세요.
          </p>
          <div className="export__buttons">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void copy()}>
              서식 유지 복사
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void zip()}>
              이미지 ZIP 내려받기
            </button>
            {canSaveToFolder() && (
              <button type="button" className="btn" disabled={busy} onClick={() => void folder()}>
                폴더에 저장
              </button>
            )}
          </div>
          {fileNames && fileNames.length > 0 && <p className="muted export__files">첨부 순서: {fileNames.join(', ')}</p>}
          {notice && (
            <p className={notice.error ? 'export__notice export__notice--error' : 'export__notice'} role={notice.error ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
          <NaverPostPanel editor={editor} columnId={columnId} />
        </div>
      )}
    </div>
  )
}
