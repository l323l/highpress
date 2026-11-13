import { deleteColumn, setBestColumn } from '../../db/store'
import type { Column, ColumnStatus, Team } from '@highpress/core/db'
import { navigate } from '../../lib/router'
import { isHttpUrl as isSafeUrl } from '@highpress/core/body'
import { PublishButton } from '../feed'

const STATUS_LABEL: Record<ColumnStatus, string> = { draft: '임시', saved: '저장됨', published: '게시됨' }

interface Props {
  column: Column
  team: Team | undefined
  best?: boolean
}

export function ColumnCard({ column, team, best = false }: Props) {
  const title = column.title.trim() || '제목 없음'
  const open = () => navigate({ name: 'write', id: column.id })

  const remove = async () => {
    if (window.confirm(`"${title}" 칼럼을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) await deleteColumn(column.id)
  }

  return (
    <article className={best ? 'card column-card column-card-best' : 'card column-card'}>
      {best && <span className="best-label">베스트 칼럼</span>}
      <h3 className="column-title">
        <button type="button" className="column-open" onClick={open}>
          {title}
        </button>
      </h3>
      <div className="column-meta">
        {team && (
          <span className="team-tag">
            <span className="team-dot" style={{ background: team.color }} aria-hidden="true" />
            {team.name}
          </span>
        )}
        <span className={`status status-${column.status}`}>{STATUS_LABEL[column.status]}</span>
        <time className="muted" dateTime={new Date(column.createdAt).toISOString()}>
          {new Date(column.createdAt).toLocaleDateString('ko-KR')}
        </time>
      </div>
      {isSafeUrl(column.publishedUrl) && (
        <a className="column-link" href={column.publishedUrl} target="_blank" rel="noopener noreferrer">
          게시된 글 보기
        </a>
      )}
      <div className="column-actions">
        <PublishButton columnId={column.id} className="btn btn-ghost" align="start" />
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={column.isBest}
          onClick={() => setBestColumn(column.isBest ? null : column.id)}
        >
          {column.isBest ? '베스트 해제' : '베스트로 지정'}
        </button>
        <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
          삭제
        </button>
      </div>
    </article>
  )
}
