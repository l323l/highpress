import { useEffect, useState, type FormEvent } from 'react'
import { toHash } from '../../lib/router'
import { useSyncState, type SyncState } from '../sync'
import { LoginButtons } from './LoginButtons'
import { AccountError, accountLabel, agree, deleteAccount, NICKNAME_MAX, signOut, useAccount } from './session'
import { loadQuota, quotaText, type Quota } from './usage'
import './account.css'

const pad = (n: number) => String(n).padStart(2, '0')

function syncText(state: SyncState): string {
  if (state.kind === 'syncing') return '초안 동기화 중…'
  if (state.kind === 'offline') return '서버에 연결하지 못했습니다 — 글은 이 기기에 저장됩니다.'
  if (state.kind === 'idle') return ''
  const d = new Date(state.at)
  const base = `초안 동기화됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return state.overQuota > 0 ? `${base} · 초안 ${state.overQuota}편은 서버 한도(3편, 편당 1MB)를 넘어 이 기기에만 있습니다.` : base
}

// 홈 화면의 계정 영역. 서버 설정이 없으면 아무것도 보여 주지 않는다 (기기 저장만 쓰는 상태).
export function AccountBar() {
  const account = useAccount()
  const sync = useSyncState()
  const [nickname, setNickname] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quota, setQuota] = useState<Quota | null>(null)

  // 내 할당량 (A-4). 동기화가 한 번 끝날 때마다 다시 읽는다.
  const ready = account.status === 'in' && account.profile !== null && account.profile !== undefined
  const syncedAt = sync.kind === 'synced' ? sync.at : 0
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void loadQuota().then((loaded) => {
      if (!cancelled) setQuota(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [ready, syncedAt])

  if (account.status === 'off') return null
  if (account.status === 'loading') {
    return (
      <section className="account" aria-label="계정">
        <p className="muted">계정을 확인하는 중…</p>
      </section>
    )
  }

  const run = async (work: () => Promise<void>, failText: string) => {
    setError('')
    setBusy(true)
    try {
      await work()
    } catch (cause) {
      if (cause instanceof AccountError && cause.code === 'closed') setError('지금은 가입 인원이 가득 찼습니다. 글쓰기는 로그인 없이 계속 쓸 수 있습니다.')
      else if (cause instanceof AccountError && cause.code === 'banned') setError('닉네임에 쓸 수 없는 말이 들어 있습니다. 다른 닉네임을 적어 주세요.')
      else setError(failText)
    } finally {
      setBusy(false)
    }
  }

  const alert = error && (
    <p className="account-error" role="alert">
      {error}
    </p>
  )

  if (account.status === 'out') {
    return (
      <section className="account" aria-label="계정">
        <p>로그인하면 작성 중인 글을 다른 기기에서 이어 쓰고, 스탯을 조회할 수 있습니다. 로그인하지 않아도 글은 이 기기에 저장됩니다.</p>
        <LoginButtons />
      </section>
    )
  }

  const logout = (
    <button type="button" className="btn" disabled={busy} onClick={() => void run(signOut, '로그아웃하지 못했습니다.')}>
      로그아웃
    </button>
  )

  if (account.profile === undefined) {
    return (
      <section className="account" aria-label="계정">
        <p>{account.serverDown ? '서버 점검 중 — 글은 이 기기에 저장됩니다. 서버가 돌아오면 다시 연결됩니다.' : '계정을 확인하는 중…'}</p>
        {logout}
        {alert}
      </section>
    )
  }

  if (account.profile === null) {
    const submit = (event: FormEvent) => {
      event.preventDefault()
      if (agreed) void run(() => agree(nickname), '가입을 마치지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    }
    return (
      <section className="account" aria-label="계정">
        <form className="account-form" onSubmit={submit}>
          <p>
            <strong>{accountLabel(account.email)}</strong>으로 처음 오셨습니다. 시작하기 전에 확인해 주세요.
          </p>
          <label className="account-field">
            <span>닉네임 (선택)</span>
            <input className="field" value={nickname} maxLength={NICKNAME_MAX} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label className="account-check">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>
              만 14세 이상이며, <a href="#/terms">이용약관</a>과 <a href="#/privacy">개인정보처리방침</a>에 동의합니다.
            </span>
          </label>
          <div className="account-actions">
            <button type="submit" className="btn btn-primary" disabled={!agreed || busy}>
              시작하기
            </button>
            {logout}
          </div>
          {alert}
        </form>
      </section>
    )
  }

  const remove = () => {
    if (!window.confirm('회원 탈퇴하면 서버의 계정과 초안 사본이 바로 삭제됩니다. 이 기기에 저장한 칼럼은 그대로 남습니다. 탈퇴할까요?')) return
    void run(deleteAccount, '탈퇴를 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
  }

  return (
    <section className="account" aria-label="계정">
      <p>
        <strong>{account.profile.nickname || accountLabel(account.email)}</strong> 님
        {syncText(sync) && (
          <span className="account-sync" role="status">
            {' · '}
            {syncText(sync)}
          </span>
        )}
      </p>
      {quota && <p className="account-quota muted">{quotaText(quota)}</p>}
      <div className="account-actions">
        <a className="btn" href={toHash({ name: 'profile', id: account.userId })}>
          내 프로필
        </a>
        {logout}
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>
          회원 탈퇴
        </button>
      </div>
      {alert}
    </section>
  )
}
