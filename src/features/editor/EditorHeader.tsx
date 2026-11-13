import type { ReactNode } from 'react'
import { ArrowLeftIcon } from '../../components/icons'
import type { Team } from '@highpress/core/db'
import { formatSaveState, type SaveState, isHttpUrl } from '@highpress/core/body'
import { TeamSelect } from './TeamSelect'

interface Props {
  title: string
  onTitleChange: (title: string) => void
  teams: Team[]
  teamId: string | null
  onTeamChange: (teamId: string | null) => void
  publishedUrl: string
  onPublishedUrlChange: (url: string) => void
  saveState: SaveState
  onBack: () => void
  onSaveDraft: () => void
  onSave: () => void
  // 내보내기 버튼 등 화면 수준 동작이 들어갈 자리.
  actions?: ReactNode
}

export function EditorHeader(props: Props) {
  const urlInvalid = props.publishedUrl.trim() !== '' && !isHttpUrl(props.publishedUrl)
  return (
    <header className="editor-header">
      <div className="editor-header__row">
        <button type="button" className="icon-btn" aria-label="홈으로" title="홈으로" onClick={props.onBack}>
          <ArrowLeftIcon size={20} aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="editor-title">
          제목
        </label>
        <input
          id="editor-title"
          className="editor-title"
          placeholder="제목을 입력하세요"
          value={props.title}
          maxLength={200}
          onChange={(e) => props.onTitleChange(e.target.value)}
        />
        <span className="editor-save-state muted" role="status" data-error={props.saveState.kind === 'error' || undefined}>
          {formatSaveState(props.saveState)}
        </span>
        <div className="editor-header__actions">
          {props.actions}
          <button type="button" className="btn" onClick={props.onSaveDraft}>
            임시저장
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onSave}>
            저장
          </button>
        </div>
      </div>
      <div className="editor-header__row editor-header__meta">
        <TeamSelect teams={props.teams} value={props.teamId} onChange={props.onTeamChange} />
        <label className="sr-only" htmlFor="editor-published-url">
          게시된 글 링크
        </label>
        <input
          id="editor-published-url"
          className="field editor-published-url"
          type="url"
          inputMode="url"
          placeholder="게시된 글 링크 (네이버에 올린 뒤 주소를 붙여넣으세요)"
          value={props.publishedUrl}
          maxLength={2000}
          aria-invalid={urlInvalid}
          aria-describedby={urlInvalid ? 'editor-published-url-error' : undefined}
          onChange={(e) => props.onPublishedUrlChange(e.target.value)}
        />
        {urlInvalid && (
          <span id="editor-published-url-error" className="tool-error" role="alert">
            http:// 또는 https:// 주소만 넣을 수 있습니다.
          </span>
        )}
      </div>
    </header>
  )
}
