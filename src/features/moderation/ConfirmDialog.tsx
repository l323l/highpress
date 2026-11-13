import { useId, useState, type ReactNode, type RefObject } from 'react'
import { Dialog } from './Dialog'
import { moderationErrorText, requireModeration } from './errors'

interface Props {
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  // 되돌리기 어려운 일(차단 · 삭제 · 정지)이면 위험 단추 모양으로
  danger?: boolean
  // 서버에 시킬 일. 실패하면 창에 오류를 보이고 창을 닫지 않는다.
  onConfirm: () => Promise<void>
  onClose: () => void
  returnTo?: RefObject<HTMLElement | null>
}

// 한 번 더 묻는 창. 처음 초점은 "취소"에 둔다 (Enter 를 바로 눌러도 위험한 일이 일어나지 않게).
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, danger = false, onConfirm, onClose, returnTo }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bodyId = useId()

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (cause) {
      setError(moderationErrorText(cause))
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose} returnTo={returnTo} describedBy={bodyId}>
      <div id={bodyId} className="mod-body">
        {children}
      </div>
      {error && (
        <p className="mod-error" role="alert">
          {error}
        </p>
      )}
      <div className="mod-actions">
        <button type="button" className="btn btn-ghost" data-autofocus onClick={onClose}>
          취소
        </button>
        <button type="button" className={danger ? 'btn btn-danger mod-danger' : 'btn btn-primary'} disabled={busy} onClick={() => void confirm()}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

// 차단 확인. 차단하면 그 사람의 글과 댓글이 바로 사라지므로, 부른 쪽이 목록을 새로 읽는다.
export function BlockDialog({ userId, name, onBlocked, onClose, returnTo }: { userId: string; name: string; onBlocked: (userId: string) => void; onClose: () => void; returnTo?: RefObject<HTMLElement | null> }) {
  return (
    <ConfirmDialog
      title={`${name}님을 차단할까요?`}
      confirmLabel="차단하기"
      busyLabel="차단하는 중…"
      danger
      returnTo={returnTo}
      onClose={onClose}
      onConfirm={async () => {
        const remote = await requireModeration()
        await remote.block(userId)
        onBlocked(userId)
      }}
    >
      <p>이 사람의 글과 댓글이 보이지 않고, 이 사람은 내 글에 댓글을 달거나 나를 팔로우할 수 없습니다.</p>
      <p className="muted">서로의 팔로우도 풀립니다. 설정의 “차단한 사람”에서 언제든 풀 수 있습니다.</p>
    </ConfirmDialog>
  )
}
