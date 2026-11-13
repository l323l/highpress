import { useId, useState, type FormEvent } from 'react'
import { getServer } from '../../lib/supabase'
import { canSync, useAccount } from '../account'

export type FeedbackKind = 'bug' | 'idea' | 'other'

// 서버 한도와 같은 값 (0006_feedback.sql, supabase/functions/feedback)
export const FEEDBACK_LIMITS = { body: 2000, perDay: 5 } as const

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'bug', label: '버그' },
  { value: 'idea', label: '제안' },
  { value: 'other', label: '그 밖에' },
]

// quota: 하루 5건을 넘음, full: 서버가 한도에 닿음, off: 서버에 피드백 받는 함수가 아직 없음
export type FeedbackErrorCode = 'quota' | 'full' | 'off' | 'failed'

export class FeedbackError extends Error {
  readonly code: FeedbackErrorCode

  constructor(code: FeedbackErrorCode) {
    super(code)
    this.code = code
  }
}

// 피드백을 서버 함수로 보낸다. 서버가 적어 두고 운영자의 메일로 전달한다.
export async function sendFeedback(kind: FeedbackKind, body: string): Promise<void> {
  const server = await getServer()
  if (!server) throw new FeedbackError('off')
  const { error } = await server.functions.invoke('feedback', { body: { kind, body } })
  if (!error) return
  // 서버가 거절한 이유는 응답 상태로 온다.
  const status = (error as { context?: { status?: number } }).context?.status
  if (status === 429) throw new FeedbackError('quota')
  if (status === 503) throw new FeedbackError('full')
  if (status === 404) throw new FeedbackError('off')
  throw new FeedbackError('failed')
}

function errorText(cause: unknown): string {
  const code = cause instanceof FeedbackError ? cause.code : 'failed'
  if (code === 'quota') return `피드백은 하루 ${FEEDBACK_LIMITS.perDay}건까지 보낼 수 있습니다. 내일 다시 보내 주세요.`
  if (code === 'full') return '서버가 한도에 닿아 지금은 피드백을 받지 않습니다.'
  if (code === 'off') return '피드백을 받는 서버가 아직 준비되지 않았습니다.'
  return '피드백을 보내지 못했습니다. 적은 글은 그대로 있으니 잠시 뒤 다시 보내 주세요.'
}

// 설정창의 피드백: 개발자에게 보내는 문의 글. 로그인하고 약관에 동의한 사람만 보낸다.
export function FeedbackForm() {
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const bodyId = useId()

  if (account.status === 'off') return <p className="muted">서버에 연결되지 않은 상태에서는 피드백을 보낼 수 없습니다.</p>
  if (!canSync(account)) return <p className="muted">로그인하면 개발자에게 피드백을 보낼 수 있습니다.</p>

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      await sendFeedback(kind, text)
      setBody('')
      setSent(true)
      setOpen(false)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <>
        <p className="muted">불편한 점이나 바라는 점을 개발자에게 보냅니다.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSent(false)
            setOpen(true)
          }}
        >
          피드백 쓰기
        </button>
        {sent && (
          <p className="home-message" role="status">
            피드백을 보냈습니다. 고맙습니다.
          </p>
        )}
      </>
    )
  }

  return (
    <form className="feedback" onSubmit={(event) => void submit(event)}>
      <div className="seg" role="group" aria-label="피드백 종류">
        {KINDS.map((item) => (
          <button key={item.value} type="button" aria-pressed={kind === item.value} onClick={() => setKind(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="feedback-field">
        <label htmlFor={bodyId}>내용</label>
        <textarea
          id={bodyId}
          className="field"
          rows={6}
          value={body}
          maxLength={FEEDBACK_LIMITS.body}
          placeholder="어떤 화면에서 무엇을 하다가 생긴 일인지 적어 주시면 고치기 쉽습니다"
          onChange={(event) => setBody(event.target.value)}
        />
        <span className="feedback-hint muted">
          {body.length.toLocaleString('ko-KR')}/{FEEDBACK_LIMITS.body.toLocaleString('ko-KR')}자. 닉네임과 종류, 내용이 개발자에게 전달됩니다. 이메일 주소는 전달되지 않습니다.
        </span>
      </div>
      {error && (
        <p className="home-message" role="alert" data-error="true">
          {error}
        </p>
      )}
      <div className="feedback-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!body.trim() || busy}>
          {busy ? '보내는 중…' : '보내기'}
        </button>
      </div>
    </form>
  )
}
