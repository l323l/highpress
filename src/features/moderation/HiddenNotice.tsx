import { useRef, useState } from 'react'
import { EyeSlashIcon } from '../../components/icons'
import { FeedbackForm } from '../feedback/FeedbackForm'
import { HIDDEN_NOTICE } from './api'
import { Dialog } from './Dialog'
// 피드백 양식의 모양은 홈의 설정창 것을 그대로 쓴다.
import '../home/home.css'
import './moderation.css'

// 신고로 숨겨진 내 글 · 댓글에 붙는 안내 줄. 글쓴이 자신에게만 보인다 (서버가 글쓴이에게만 hidden 을 보낸다).
// 문의는 설정의 피드백과 같은 양식으로 보낸다.
export function HiddenNotice({ what }: { what: '글' | '댓글' }) {
  const [asking, setAsking] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)

  return (
    <div className="mod-hidden" role="note">
      <EyeSlashIcon size={16} aria-hidden="true" />
      <p>
        {HIDDEN_NOTICE}{' '}
        <button ref={opener} type="button" className="mod-link" onClick={() => setAsking(true)}>
          피드백으로 문의하기
        </button>
      </p>
      {asking && (
        <Dialog title={`숨겨진 ${what}에 대해 문의하기`} onClose={() => setAsking(false)} returnTo={opener}>
          <p className="mod-lead">어느 {what}인지 함께 적어 주시면 확인하기 쉽습니다.</p>
          <div className="mod-feedback">
            <FeedbackForm />
          </div>
        </Dialog>
      )}
    </div>
  )
}
