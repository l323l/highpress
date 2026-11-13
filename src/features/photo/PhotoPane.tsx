import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type KeyboardEvent, type SetStateAction } from 'react'
import { ArrowsDownUpIcon, ArrowsLeftRightIcon, DownloadSimpleIcon, ImageSquareIcon, ImagesIcon } from '../../components/icons'
import { IMAGE_MAX_BYTES } from '@highpress/core/db'
import { downloadBlob } from '../../lib/download'
import { baseName, planCollage, planSingle, sourceProblem, type CollageLayout, commit, DEFAULT_COLOR, emptyHistory, MARK_LIMITS, newMarkId, nextNumber, redo, undo, unitOf, type History, type Mark, type NewMark, type Point, type Size, type StrokeSize, type ToolId } from '@highpress/core/photo'
import { loadSource, paintBase, type Source } from './collage'
import { PhotoCanvas, type PhotoCanvasHandle } from './PhotoCanvas'
import { PhotoTools } from './PhotoTools'
import './photo.css'

// 탭을 오가는 동안만 들고 있는 편집 상태. 사진은 저장하지 않고 서버로도 보내지 않는다.
export interface PhotoSession {
  kind: 'single' | 'collage'
  // 한 장이면 [사진], 콜라주면 [왼쪽 · 위, 오른쪽 · 아래]
  sources: (Source | null)[]
  layout: CollageLayout
  gap: number
  gapColor: string
  // 표시를 그릴 바탕. 콜라주를 맞추는 동안은 null.
  base: { canvas: HTMLCanvasElement; size: Size; name: string } | null
  history: History
}

interface Props {
  session: PhotoSession | null
  // 사진을 읽는 동안 다른 칸이 바뀔 수 있어 최신 상태에서 고치는 함수도 받는다.
  onSession: Dispatch<SetStateAction<PhotoSession | null>>
  onInsertFiles?: (files: File[]) => void
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const GAP_COLORS = [
  { value: '#ffffff', label: '흰색' },
  { value: '#111113', label: '검정' },
]

function newCollage(sources: (Source | null)[] = [null, null]): PhotoSession {
  return { kind: 'collage', sources, layout: 'row', gap: 1.5, gapColor: '#ffffff', base: null, history: emptyHistory() }
}

function buildBase(session: PhotoSession): PhotoSession['base'] {
  const sources = session.sources.filter((source): source is Source => source !== null)
  if (session.kind === 'single' ? sources.length < 1 : sources.length < 2) return null
  const plan = session.kind === 'single' ? planSingle(sources[0].size) : planCollage(sources[0].size, sources[1].size, session.layout, session.gap)
  const canvas = document.createElement('canvas')
  paintBase(canvas, plan, sources, session.gapColor)
  const name = session.kind === 'single' ? baseName(sources[0].name) : `${baseName(sources[0].name)}-콜라주`
  return { canvas, size: { width: plan.width, height: plan.height }, name }
}

// 콜라주 칸에 넣은 사진의 작은 미리보기
function Thumb({ source }: { source: Source }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const k = Math.min(1, 320 / Math.max(source.size.width, source.size.height))
    canvas.width = Math.round(source.size.width * k)
    canvas.height = Math.round(source.size.height * k)
    canvas.getContext('2d')?.drawImage(source.image, 0, 0, canvas.width, canvas.height)
  }, [source])
  return <canvas ref={ref} className="photo-thumb" aria-hidden="true" />
}

// 콜라주를 맞추는 동안 보여 주는 결과 미리보기
function CollagePreview({ session }: { session: PhotoSession }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [a, b] = session.sources
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !a || !b) return
    paintBase(canvas, planCollage(a.size, b.size, session.layout, session.gap, 900), [a, b], session.gapColor)
  }, [a, b, session.layout, session.gap, session.gapColor])
  if (!a || !b) return <div className="photo-preview photo-preview--empty muted">두 장을 모두 넣으면 붙인 모양이 여기에 보입니다.</div>
  return <canvas ref={ref} className="photo-preview" aria-label="콜라주 미리보기" role="img" />
}

const isTyping = (target: EventTarget) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function PhotoPane({ session, onSession, onInsertFiles }: Props) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tool, setTool] = useState<ToolId>('pass')
  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [size, setSize] = useState<StrokeSize>(2)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const canvasRef = useRef<PhotoCanvasHandle>(null)
  const textRef = useRef<HTMLInputElement>(null)
  // 글자를 새로 놓거나 두 번 누르면 아래 칸으로 초점을 옮겨 바로 고치게 한다. 칸은 다음 그리기에서 생긴다.
  const focusText = () =>
    requestAnimationFrame(() => {
      textRef.current?.focus()
      textRef.current?.select()
    })

  const read = async (files: File[]): Promise<Source[] | null> => {
    setError('')
    setMessage('')
    const problem = files.map(sourceProblem).find(Boolean)
    if (problem) {
      setError(problem)
      return null
    }
    setLoading(true)
    try {
      return await Promise.all(files.map(loadSource))
    } catch {
      setError('사진을 읽지 못했습니다. 다른 사진으로 해 주세요.')
      return null
    } finally {
      setLoading(false)
    }
  }

  const startSingle = async (files: File[]) => {
    const sources = await read(files.slice(0, 1))
    if (!sources) return
    const next: PhotoSession = { ...newCollage(sources), kind: 'single' }
    setSelectedId(null)
    onSession({ ...next, base: buildBase(next) })
  }

  const startCollage = async (files: File[]) => {
    const sources = files.length ? await read(files.slice(0, 2)) : []
    if (!sources) return
    setSelectedId(null)
    onSession(newCollage([sources[0] ?? null, sources[1] ?? null]))
  }

  const fromInput = (handler: (files: File[]) => Promise<void>) => (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) void handler(files)
  }

  const dropProps = (onFiles: (files: File[]) => void) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent) => {
      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
      setDragging(false)
      if (!files.length) return
      event.preventDefault()
      onFiles(files)
    },
  })

  const errorLine = error && (
    <p className="photo-error" role="alert">
      {error}
    </p>
  )

  // ── 처음 화면 ───────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="photo-pane">
        <div className="photo-start" data-dragging={dragging || undefined} {...dropProps((files) => void (files.length >= 2 ? startCollage(files) : startSingle(files)))}>
          <div className="photo-start__art" aria-hidden="true">
            <span className="photo-start__frame photo-start__frame--a" />
            <span className="photo-start__frame photo-start__frame--b" />
            <svg viewBox="0 0 120 80" className="photo-start__marks">
              <ellipse cx="38" cy="58" rx="16" ry="5.5" />
              <path d="M44 50 C 62 30, 78 28, 90 34" />
              <path d="M95 37 l-11 -1 l5 -8 z" className="photo-start__head" />
            </svg>
          </div>
          <h2 className="photo-start__title">경기 사진에 표시를 더합니다</h2>
          <p className="muted photo-start__text">화살표 · 선수 원 · 조명 · 이름표로 장면을 설명하고, 두 장을 붙여 비교 사진을 만듭니다.</p>
          <div className="photo-start__actions">
            <label className="btn btn-primary photo-pick">
              <ImageSquareIcon size={18} aria-hidden="true" />
              {loading ? '사진을 읽는 중…' : '사진 한 장 불러오기'}
              <input type="file" accept={ACCEPT} disabled={loading} onChange={fromInput(startSingle)} />
            </label>
            <button type="button" className="btn" disabled={loading} onClick={() => void startCollage([])}>
              <ImagesIcon size={18} aria-hidden="true" />두 장 붙이기 (콜라주)
            </button>
          </div>
          <p className="muted photo-start__note">사진을 여기에 끌어 놓아도 됩니다. 두 장을 함께 놓으면 콜라주가 됩니다. 사진은 이 기기 안에서만 처리됩니다.</p>
          {errorLine}
        </div>
      </div>
    )
  }

  const close = () => {
    if (session.history.present.length > 0 && !window.confirm('그린 표시가 모두 사라집니다. 닫을까요?')) return
    setSelectedId(null)
    setError('')
    setMessage('')
    onSession(null)
  }

  // ── 콜라주 맞추기 ───────────────────────────────────────────────────────
  if (!session.base) {
    const [a, b] = session.sources
    const patch = (next: Partial<PhotoSession>) => onSession({ ...session, ...next })
    const putSlot = async (index: 0 | 1, files: File[]) => {
      // 첫 칸에 두 장을 함께 놓으면 두 칸을 한 번에 채운다.
      const loaded = await read(files.slice(0, index === 0 && files.length > 1 ? 2 : 1))
      if (!loaded) return
      // 읽는 사이 다른 칸에 사진이 들어왔을 수 있으므로 지금 상태에서 이 칸만 바꾼다.
      onSession((latest) => {
        if (!latest || latest.base) return latest
        const sources = [...latest.sources]
        sources[index] = loaded[0]
        if (loaded[1]) sources[1] = loaded[1]
        return { ...latest, sources }
      })
    }
    const slot = (index: 0 | 1) => {
      const source = session.sources[index]
      const place = session.layout === 'row' ? (index === 0 ? '왼쪽' : '오른쪽') : index === 0 ? '위' : '아래'
      return (
        <label className="photo-slot" data-filled={source ? true : undefined} {...dropProps((files) => void putSlot(index, files))}>
          {source ? <Thumb source={source} /> : <ImageSquareIcon size={28} aria-hidden="true" />}
          <span className="photo-slot__label">
            <strong>{place} 사진</strong>
            <span className="muted">{source ? '눌러서 바꾸기' : '눌러서 고르기'}</span>
          </span>
          <input type="file" accept={ACCEPT} disabled={loading} onChange={fromInput((files) => putSlot(index, files))} aria-label={`${place} 사진 고르기`} />
        </label>
      )
    }

    return (
      <div className="photo-pane">
        <div className="photo-row">
          <strong>두 장 붙이기</strong>
          <span className="photo-spacer" />
          <button type="button" className="btn" onClick={close}>
            닫기
          </button>
        </div>

        <div className="photo-collage" data-layout={session.layout}>
          {slot(0)}
          {slot(1)}
        </div>

        <div className="photo-row" role="group" aria-label="붙이는 모양">
          <div className="seg photo-seg" role="group" aria-label="배치">
            <button type="button" aria-pressed={session.layout === 'row'} onClick={() => patch({ layout: 'row' })}>
              <ArrowsLeftRightIcon size={16} aria-hidden="true" />
              좌우
            </button>
            <button type="button" aria-pressed={session.layout === 'column'} onClick={() => patch({ layout: 'column' })}>
              <ArrowsDownUpIcon size={16} aria-hidden="true" />
              위아래
            </button>
          </div>
          <button type="button" className="btn" disabled={!a && !b} onClick={() => patch({ sources: [b ?? null, a ?? null] })}>
            순서 바꾸기
          </button>
          <label className="photo-field photo-field--range">
            <span>사이 간격</span>
            <input type="range" min={0} max={6} step={0.5} value={session.gap} onChange={(event) => patch({ gap: Number(event.target.value) })} />
          </label>
          <div className="seg photo-seg" role="group" aria-label="간격 색">
            {GAP_COLORS.map((option) => (
              <button key={option.value} type="button" aria-pressed={session.gapColor === option.value} disabled={session.gap === 0} onClick={() => patch({ gapColor: option.value })}>
                <span className="photo-dot" style={{ background: option.value }} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <CollagePreview session={session} />
        {errorLine}

        <div className="photo-row photo-row--end">
          <span className="muted photo-row__note">사진은 자르지 않습니다. 좌우는 높이를, 위아래는 너비를 맞춰 붙입니다.</span>
          <button type="button" className="btn btn-primary" disabled={!a || !b} onClick={() => onSession({ ...session, base: buildBase(session) })}>
            이 사진으로 꾸미기
          </button>
        </div>
      </div>
    )
  }

  // ── 꾸미기 ─────────────────────────────────────────────────────────────
  const { base, history } = session
  const marks = history.present
  const selected = marks.find((mark) => mark.id === selectedId) ?? null
  const setHistory = (next: History) => onSession({ ...session, history: next })
  const apply = (next: Mark[]) => setHistory(commit(history, next))
  const u = unitOf(base.size)

  const add = (mark: NewMark) => {
    if (marks.length >= MARK_LIMITS.maxMarks) {
      setError(`표시는 ${MARK_LIMITS.maxMarks}개까지 넣을 수 있습니다.`)
      return null
    }
    setError('')
    const created = { ...mark, id: newMarkId() } as Mark
    apply([...marks, created])
    setSelectedId(created.id)
    return created
  }

  const place = (point: Point) => {
    if (tool === 'text') {
      if (add({ kind: 'text', color, x: point.x, y: point.y, text: '선수 이름', fontSize: Math.round(30 * u), boxed: true })) focusText()
    } else if (tool === 'number') add({ kind: 'number', color, x: point.x, y: point.y, value: nextNumber(marks), r: Math.round(22 * u) })
  }

  const change = (mark: Mark) => apply(marks.map((item) => (item.id === mark.id ? mark : item)))
  const patchSelected = (patch: Partial<Mark>) => {
    if (selected) change({ ...selected, ...patch } as Mark)
  }
  const remove = () => {
    if (!selected) return
    apply(marks.filter((mark) => mark.id !== selected.id))
    setSelectedId(null)
  }
  const step = (next: History) => {
    setHistory(next)
    setSelectedId(null)
  }

  const pickTool = (next: ToolId) => {
    setTool(next)
    if (next !== 'select') setSelectedId(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isTyping(event.target)) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault()
      remove()
    } else if (mod && key === 'z') {
      event.preventDefault()
      step(event.shiftKey ? redo(history) : undo(history))
    } else if (mod && key === 'y') {
      event.preventDefault()
      step(redo(history))
    } else if (event.key === 'Escape') {
      setSelectedId(null)
      setTool('select')
    }
  }

  // 본문 이미지는 10MB까지라 JPG로 내보낸다. 넘으면 화질을 낮춰 한 번 더 만든다.
  const encode = async () => {
    const handle = canvasRef.current
    if (!handle) throw new Error('not-ready')
    let blob = await handle.toBlob('image/jpeg', 0.92)
    if (blob.size > IMAGE_MAX_BYTES) blob = await handle.toBlob('image/jpeg', 0.75)
    return new File([blob], `${base.name}-편집.jpg`, { type: 'image/jpeg' })
  }

  const run = async (kind: 'insert' | 'download') => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const file = await encode()
      const sizeText = `${(file.size / 1024 / 1024).toFixed(1)}MB`
      if (kind === 'download') {
        downloadBlob(file, file.name)
        setMessage(`JPG 파일을 내려받았습니다 (${sizeText}).`)
      } else if (file.size > IMAGE_MAX_BYTES) {
        setError(`사진이 ${sizeText}라서 본문에 넣을 수 없습니다 (10MB까지).`)
      } else {
        onInsertFiles?.([file])
        setMessage(`본문에 넣었습니다 (${sizeText}).`)
      }
    } catch {
      setError('사진을 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  // 한 장으로 꾸미던 중이면 그 사진을 첫 칸에 두고 콜라주로 넘어간다.
  const toCollage = () => {
    if (marks.length > 0 && !window.confirm('콜라주를 맞추면 그린 표시가 모두 사라집니다. 계속할까요?')) return
    setSelectedId(null)
    onSession(session.kind === 'collage' ? { ...session, base: null, history: emptyHistory() } : newCollage([session.sources[0] ?? null, null]))
  }

  return (
    <div className="photo-pane" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="photo-row">
        <strong className="photo-name" title={base.name}>
          {base.name}
        </strong>
        <span className="muted">
          {base.size.width}×{base.size.height}
        </span>
        <span className="photo-spacer" />
        <button type="button" className="btn" onClick={toCollage}>
          {session.kind === 'collage' ? '콜라주 다시 맞추기' : '두 장 붙이기'}
        </button>
        <button type="button" className="btn" onClick={close}>
          닫기
        </button>
      </div>

      <PhotoTools
        tool={tool}
        onTool={pickTool}
        color={color}
        onColor={setColor}
        size={size}
        onSize={setSize}
        selected={selected}
        onPatch={patchSelected}
        onDelete={remove}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => step(undo(history))}
        onRedo={() => step(redo(history))}
        onClear={() => step(commit(history, []))}
        hasMarks={marks.length > 0}
        textRef={textRef}
      />

      <PhotoCanvas
        ref={canvasRef}
        base={base.canvas}
        size={base.size}
        marks={marks}
        tool={tool}
        style={{ color, size }}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={(mark) => void add(mark)}
        onPlace={place}
        onChange={change}
        onEditText={(id) => {
          setSelectedId(id)
          focusText()
        }}
      />

      {errorLine}
      {!error && message && (
        <p className="photo-message muted" role="status">
          {message}
        </p>
      )}
      <div className="photo-row photo-row--end">
        <button type="button" className="btn" disabled={busy} onClick={() => void run('download')}>
          <DownloadSimpleIcon size={16} aria-hidden="true" />
          JPG 내려받기
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !onInsertFiles} onClick={() => void run('insert')}>
          {busy ? '만드는 중…' : '본문에 넣기'}
        </button>
      </div>
    </div>
  )
}
