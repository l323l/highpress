import { useEffect, useState } from 'react'
import { canSync, useAccount } from '../account'
import { Avatar } from '../feed/Rails'
import { displayName } from '../feed/helpers'
import type { BlockedPerson } from './api'
import { moderationErrorText, requireModeration } from './errors'
import './moderation.css'

const dateText = (ms: number) => new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

// 설정창의 "차단한 사람": 차단한 사람 목록과 차단 풀기. 가입을 마친 사람에게만 보인다.
export function BlockedSection() {
  const account = useAccount()
  const member = account.status === 'in' && canSync(account)
  // null: 불러오는 중
  const [people, setPeople] = useState<BlockedPerson[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!member) return
    let cancelled = false
    requireModeration()
      .then((remote) => remote.blocks())
      .then((loaded) => {
        if (!cancelled) setPeople(loaded)
      })
      .catch((cause) => {
        if (cancelled) return
        setPeople([])
        setError(moderationErrorText(cause))
      })
    return () => {
      cancelled = true
    }
  }, [member])

  if (!member) return null

  const unblock = async (person: BlockedPerson) => {
    setBusy(person.userId)
    setError('')
    setMessage('')
    try {
      const remote = await requireModeration()
      await remote.unblock(person.userId)
      setPeople((current) => current?.filter((item) => item.userId !== person.userId) ?? current)
      setMessage(`${displayName(person.nickname)}님의 차단을 풀었습니다.`)
    } catch (cause) {
      setError(moderationErrorText(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="drawer-section" aria-labelledby="blocked-title">
      <h3 id="blocked-title">차단한 사람</h3>
      <p className="muted">차단한 사람의 글과 댓글은 보이지 않습니다. 풀면 다시 보이지만, 풀렸던 팔로우는 돌아오지 않습니다.</p>
      {people === null ? (
        <p className="muted" role="status">
          불러오는 중…
        </p>
      ) : people.length === 0 ? (
        !error && <p className="muted">차단한 사람이 없습니다.</p>
      ) : (
        <ul className="mod-blocked">
          {people.map((person) => {
            const name = displayName(person.nickname)
            return (
              <li key={person.userId}>
                <Avatar name={person.nickname} size={32} src={person.avatar} />
                <span className="mod-blocked__who">
                  <strong>{name}</strong>
                  <span className="muted">{dateText(person.blockedAt)}에 차단</span>
                </span>
                <button type="button" className="btn" aria-label={`${name}님 차단 풀기`} disabled={busy !== null} onClick={() => void unblock(person)}>
                  {busy === person.userId ? '푸는 중…' : '차단 풀기'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p className="home-message" role="alert" data-error="true">
          {error}
        </p>
      )}
      {message && (
        <p className="home-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
