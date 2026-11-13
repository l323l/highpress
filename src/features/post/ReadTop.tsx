import { useState, type FormEvent } from 'react'
import { MagnifyingGlassIcon } from '../../components/icons'
import { Logo } from '../../components/Logo'
import { navigate, toHash } from '../../lib/router'
import { canSync, useAccount } from '../account'
import { openLogin } from '../account/loginPrompt'
import { displayName, FEED_LIMITS, RingAvatar } from '../feed'
// 검색창과 내 계정 표시는 홈의 것을 그대로 쓴다.
import '../home/home.css'

// 글 화면의 맨 위 줄: 이름 | 검색 | 로그인·내 계정. 읽는 동안 화면 위에 붙어 있다.
export function ReadTop() {
  const account = useAccount()
  const [draft, setDraft] = useState('')
  const member = account.status === 'in' && canSync(account)

  // 검색은 홈의 피드에서 한다. 찾을 말을 들고 홈으로 간다.
  const search = (event: FormEvent) => {
    event.preventDefault()
    const q = draft.trim()
    if (q) navigate({ name: 'home', q })
  }

  return (
    <header className="read-top">
      <div className="read-top__inner">
        <a className="read-brand" href="#/" title="피드로">
          <Logo size={28} />
          <span lang="en">HIGH PRESS</span>
        </a>

        <form className="home-search read-search" role="search" onSubmit={search}>
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="read-search">
            칼럼과 칼럼리스트 찾기
          </label>
          <input id="read-search" type="search" placeholder="칼럼과 칼럼리스트 찾기" value={draft} maxLength={FEED_LIMITS.query} onChange={(event) => setDraft(event.target.value)} />
        </form>

        <div className="read-top__end">
          {account.status === 'in' && member && (
            <a className="home-me" href={toHash({ name: 'profile', id: account.userId })} title="내 프로필">
              <RingAvatar name={account.profile?.nickname ?? ''} size={28} src={account.profile?.avatar} />
              <span>{displayName(account.profile?.nickname ?? '')}</span>
            </a>
          )}
          {account.status === 'out' && (
            <button type="button" className="btn btn-primary" onClick={openLogin}>
              로그인 · 가입
            </button>
          )}
          {account.status === 'in' && !member && (
            <a className="btn btn-primary" href="#/">
              가입 마치기
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
