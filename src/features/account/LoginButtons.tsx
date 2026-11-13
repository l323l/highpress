import { GoogleLogoIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { naverReady } from '../naver/naverAuth'
import { AccountError, NaverAuthError, signIn, signInWithNaver } from './session'

type Way = 'google' | 'naver'

function failText(cause: unknown): string {
  if (cause instanceof NaverAuthError && cause.problem === 'popup') return '팝업이 막혀 네이버 로그인 창을 열지 못했습니다. 주소창에서 팝업을 허용한 뒤 다시 눌러 주세요.'
  if (cause instanceof NaverAuthError && cause.problem === 'cancelled') return '네이버 로그인을 마치지 않았습니다. 다시 눌러 주세요.'
  if (cause instanceof AccountError && cause.code === 'rate') return '네이버 로그인 시도가 너무 잦습니다. 10분쯤 뒤에 다시 눌러 주세요.'
  if (cause instanceof AccountError && cause.code === 'verifier') return '로그인 확인 값이 맞지 않아 멈췄습니다. 이 창에서 네이버로 로그인을 처음부터 다시 눌러 주세요.'
  return '로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}

// 로그인 방법 두 가지. Google 은 화면이 Google 로 넘어갔다 돌아오고, 네이버는 작은 창이 떴다 닫힌다.
// 네이버 단추는 서버에 네이버 설정이 있을 때만 보인다.
export function LoginButtons() {
  const [busy, setBusy] = useState<Way | null>(null)
  const [error, setError] = useState('')

  const start = (way: Way) => {
    setError('')
    setBusy(way)
    // 네이버 로그인 창은 누른 처리 안에서 바로 떠야 하므로, 여기서 기다림 없이 부른다.
    void (way === 'google' ? signIn() : signInWithNaver())
      .catch((cause: unknown) => setError(failText(cause)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="login-buttons">
      <button type="button" className="btn btn-primary login-buttons__button" disabled={busy !== null} onClick={() => start('google')}>
        <GoogleLogoIcon size={18} weight="bold" aria-hidden="true" />
        Google로 로그인
      </button>
      {naverReady() && (
        <button type="button" className="btn naver-button login-buttons__button" disabled={busy !== null} onClick={() => start('naver')}>
          <span className="naver-button__n" aria-hidden="true">
            N
          </span>
          {busy === 'naver' ? '네이버 로그인 창에서 계속해 주세요…' : '네이버로 로그인'}
        </button>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
