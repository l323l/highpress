import { useId, useState, type FormEvent, type RefObject } from 'react'
import { AUTO_HIDE_REPORTS, MODERATION_LIMITS, REPORT_REASONS, type ReportKind, type ReportPart, type ReportReason } from './api'
import { Dialog } from './Dialog'
import { moderationErrorText, requireModeration } from './errors'

// 무엇을 신고하는지. 대표 사진은 글(post), 프로필 사진은 사용자(user)로 보내고 part 로 가린다.
export interface ReportTarget {
  kind: ReportKind
  targetId: string
  part?: ReportPart
  // 화면에 보이는 이름: 글, 대표 사진, 댓글, 사용자, 프로필 사진
  label: string
  // 무엇을 신고하는지 한 줄로 (글 제목, 댓글 앞부분, 닉네임)
  preview: string
}

const KOREAN_COUNT = ['영', '한', '두', '세', '네', '다섯']

// 신고 창: 사유를 고르고, 원하면 자세한 내용을 적어 보낸다. 보낸 뒤에는 같은 창에서 결과를 알려 준다.
export function ReportSheet({ target, onClose, returnTo }: { target: ReportTarget; onClose: () => void; returnTo?: RefObject<HTMLElement | null> }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const name = useId()
  const detailId = useId()
  const noteId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason || busy) return
    setBusy(true)
    setError('')
    try {
      const remote = await requireModeration()
      await remote.report({ kind: target.kind, targetId: target.targetId, reason, detail, part: target.part })
      setSent(true)
    } catch (cause) {
      setError(moderationErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={`${target.label} 신고하기`} onClose={onClose} returnTo={returnTo} describedBy={sent ? undefined : noteId}>
      {target.preview && <p className="mod-preview">{target.preview}</p>}
      {sent ? (
        <>
          <p className="mod-done" role="status">
            신고했습니다. 운영자가 확인합니다.
          </p>
          <div className="mod-actions">
            <button type="button" className="btn btn-primary" autoFocus onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      ) : (
        <form className="mod-form" onSubmit={(event) => void submit(event)}>
          <fieldset className="mod-reasons">
            <legend>사유</legend>
            {REPORT_REASONS.map((item, index) => (
              <label key={item.id} className="mod-reason">
                <input type="radio" name={name} value={item.id} checked={reason === item.id} data-autofocus={index === 0 || undefined} onChange={() => setReason(item.id)} />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="mod-field">
            <label htmlFor={detailId}>
              자세한 내용 <span className="muted">(선택)</span>
            </label>
            <textarea
              id={detailId}
              className="field"
              rows={3}
              value={detail}
              maxLength={MODERATION_LIMITS.detail}
              placeholder="운영자가 확인할 때 참고할 내용을 적어 주세요"
              onChange={(event) => setDetail(event.target.value)}
            />
            <span className="mod-hint muted">
              {detail.length}/{MODERATION_LIMITS.detail}자
            </span>
          </div>
          <p id={noteId} className="mod-note muted">
            서로 다른 {KOREAN_COUNT[AUTO_HIDE_REPORTS] ?? AUTO_HIDE_REPORTS} 사람이 신고하면 운영자가 확인하기 전까지 다른 사람에게 보이지 않습니다.
          </p>
          {error && (
            <p className="mod-error" role="alert">
              {error}
            </p>
          )}
          <div className="mod-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={!reason || busy}>
              {busy ? '보내는 중…' : '신고하기'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
