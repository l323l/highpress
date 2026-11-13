import { useAccount } from '../account'
import { openLogin } from '../account/loginPrompt'

// 피드는 로그인 없이 읽는다. 좋아요 · 댓글 · 팔로우 · 피드에 올리기처럼 로그인해야 하는 일을 눌렀을 때 이 안내가 뜬다.
export function LoginNote({ what, onClose }: { what: string; onClose?: () => void }) {
  const account = useAccount()
  // 로그인은 했지만 약관 동의(가입)를 마치지 않은 사람
  const halfway = account.status === 'in'

  return (
    <div className="login-note" role="status">
      <p>{halfway ? `${what} 가입을 마친 뒤에 할 수 있습니다. 홈 화면의 “가입 마치기”를 눌러 주세요.` : `${what} 로그인한 뒤에 할 수 있습니다. 글 읽기는 로그인 없이 됩니다.`}</p>
      <div className="login-note__actions">
        {!halfway && (
          <button type="button" className="btn btn-primary" onClick={openLogin}>
            로그인 · 가입
          </button>
        )}
        {onClose && (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        )}
      </div>
    </div>
  )
}
