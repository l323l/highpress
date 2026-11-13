import { useEffect, useState, type DragEvent } from 'react'
import type { TacticProject } from '@highpress/core/db'
import { TACTIC_DRAG_MIME, type TacticDragPayload, type TacticFormat } from '@highpress/core/body'
import { downloadBlob } from '../../lib/download'
import { TooManyFramesError } from '@highpress/core/tactics'
import { isMp4Supported } from './export/mp4'
import { renderTactic } from './export/renderTactic'

const INSERT_FORMATS = ['png', 'gif'] as const
const DOWNLOAD_FORMATS = ['png', 'gif', 'mp4'] as const
const MP4_HINT = '이 브라우저는 MP4 내보내기를 지원하지 않습니다 (GIF·PNG 사용)'

interface ExportBarProps {
  project: TacticProject
  sceneIndex: number
  flush: () => Promise<void>
  onInsert?: (payload: TacticDragPayload) => void
}

export function ExportBar({ project, sceneIndex, flush, onInsert }: ExportBarProps) {
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<TacticFormat | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void isMp4Supported().then((supported) => {
      if (!cancelled) setMp4Supported(supported)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // PNG는 지금 고른 장면 한 장이므로 장면 번호를 함께 싣는다. GIF는 전체 애니메이션이라 필요 없다.
  const payloadFor = (format: TacticDragPayload['format']): TacticDragPayload =>
    format === 'png' ? { projectId: project.id, format, sceneIndex } : { projectId: project.id, format }

  // dragstart 안에서는 기다릴 수 없으므로 저장을 먼저 걸어 두고 곧바로 payload를 싣는다.
  // IndexedDB는 요청 순서대로 처리되므로 놓는 쪽에서 읽을 때는 이미 최신 상태다.
  const startDrag = (event: DragEvent, format: TacticDragPayload['format']) => {
    void flush().catch(() => undefined)
    event.dataTransfer.setData(TACTIC_DRAG_MIME, JSON.stringify(payloadFor(format)))
    event.dataTransfer.effectAllowed = 'copy'
  }

  // 저장 실패는 전술판 쪽 오류 문구로 알린다. 저장되지 않은 상태로는 본문에 넣지 않는다.
  const insert = async (format: TacticDragPayload['format']) => {
    try {
      await flush()
    } catch {
      return
    }
    onInsert?.(payloadFor(format))
  }

  const download = async (format: TacticFormat) => {
    setError('')
    setProgress(0)
    setBusy(format)
    try {
      const blob = await renderTactic(project, format, { sceneIndex, onProgress: setProgress })
      downloadBlob(blob, `전술판.${format}`)
    } catch (cause) {
      setError(
        cause instanceof TooManyFramesError
          ? cause.message
          : `${format.toUpperCase()} 내보내기에 실패했습니다. 다시 시도해 주세요.`,
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tactics-row">
      {INSERT_FORMATS.map((format) => (
        <span
          key={format}
          className="chip tactics-drag"
          draggable
          onDragStart={(event) => startDrag(event, format)}
        >
          {format.toUpperCase()} 끌어다 넣기
        </span>
      ))}
      {onInsert &&
        INSERT_FORMATS.map((format) => (
          <button key={format} type="button" className="btn btn-primary" onClick={() => void insert(format)}>
            본문에 넣기 ({format.toUpperCase()})
          </button>
        ))}
      <span className="tactics-spacer" />
      {DOWNLOAD_FORMATS.map((format) => {
        const unsupported = format === 'mp4' && mp4Supported !== true
        return (
          <button
            key={format}
            type="button"
            className="btn"
            disabled={busy !== null || unsupported}
            title={format === 'mp4' && mp4Supported === false ? MP4_HINT : undefined}
            onClick={() => void download(format)}
          >
            {format.toUpperCase()} 내려받기
          </button>
        )
      })}
      {mp4Supported === false && <p className="muted tactics-note">{MP4_HINT}</p>}
      {busy && (
        <p className="tactics-note" role="status">
          {busy.toUpperCase()} 만드는 중… {Math.round(progress * 100)}%
        </p>
      )}
      {error && (
        <p className="tactics-note tactics-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
