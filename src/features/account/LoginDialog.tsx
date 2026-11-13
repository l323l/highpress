import { XIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { naverReady } from '../naver/naverAuth'
import { LoginButtons } from './LoginButtons'
import { closeLogin, useLoginPrompt } from './loginPrompt'
import { useAccount } from './session'
import './account.css'

// "로그인 · 가입"을 누르면 뜨는 창: Google 과 네이버 가운데 고른다. 앱 맨 바깥에 한 번만 둔다.
export function LoginDialog() {
  const open = useLoginPrompt()
  const account = useAccount()
  const panel = useRef<HTMLDivElement>(null)

  // 로그인되면 닫는다 (네이버 로그인은 화면이 넘어가지 않아서 이 창이 그대로 남아 있다).
  const signedIn = account.status === 'in'
  useEffect(() => {
    if (signedIn) closeLogin()
  }, [signedIn])

  // 열리면 창 안으로 초점을 옮기고, 닫히면 열기 전에 있던 자리로 돌려준다. Esc 로 닫는다.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeLogin()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus()
    }
  }, [open])

  if (!open || account.status !== 'out') return null

  return (
    <div className="login-backdrop" onClick={closeLogin}>
      <div ref={panel} className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="login-dialog__close" aria-label="닫기" title="닫기" onClick={closeLogin}>
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        <h2 id="login-title" className="login-dialog__title">
          로그인 · 가입
        </h2>
        <p className="login-dialog__text">처음이면 로그인한 뒤 닉네임을 정하고 약관에 동의하면 가입됩니다. 글 읽기와 글쓰기는 로그인 없이도 됩니다.</p>
        <LoginButtons />
        {naverReady() && <p className="login-dialog__small muted">Google과 네이버는 서로 다른 계정으로 가입됩니다. 다음에도 같은 쪽으로 로그인해 주세요.</p>}
      </div>
    </div>
  )
}
