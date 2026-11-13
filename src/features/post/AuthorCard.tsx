import { useEffect, useState } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { clubOf } from '../../lib/clubs'
import { toHash } from '../../lib/router'
import { displayName, FeedError, feedSafetyText, getFeedRemote, isOnline, LoginNote, RingAvatar, type FeedProfile } from '../feed'

// 글 화면 오른쪽 맨 위: 이 글을 쓴 사람. 소개와 숫자를 보고 바로 팔로우할 수 있다.
export function AuthorCard({ me, userId }: { me: string; userId: string }) {
  // undefined: 불러오는 중, null: 읽지 못함 (그때는 카드를 그리지 않는다)
  const [profile, setProfile] = useState<FeedProfile | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ask, setAsk] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.profile(userId) : null))
      .catch(() => null)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (profile === undefined) return <div className="side-ghost side-ghost--card" role="status" aria-label="글쓴이를 불러오는 중" />
  if (profile === null) return null

  const mine = me !== '' && me === userId
  const club = clubOf(profile.club)
  const href = toHash({ name: 'profile', id: userId })

  const toggleFollow = async () => {
    if (busy) return
    if (!me) {
      setAsk(true)
      return
    }
    const following = !profile.following
    // 먼저 화면을 바꾸고, 서버가 거절하면 되돌린다.
    setProfile({ ...profile, following, followerCount: Math.max(0, profile.followerCount + (following ? 1 : -1)) })
    setBusy(true)
    setError('')
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await (following ? remote.follow(userId) : remote.unfollow(userId))
    } catch (cause) {
      setProfile(profile)
      setError(feedSafetyText(cause) ?? (cause instanceof FeedError && cause.code === 'quota' ? '팔로우할 수 있는 사람 수를 다 채웠습니다.' : '팔로우를 반영하지 못했습니다. 잠시 뒤 다시 눌러 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="author-card" aria-label="글쓴이">
      <div className="author-card__head">
        <a className="author-card__who" href={href}>
          <RingAvatar name={profile.nickname} size={44} fresh={profile.fresh} online={me !== '' && isOnline(profile)} src={profile.avatar} />
          <span className="author-card__name">
            <strong>{displayName(profile.nickname)}</strong>
            <span className="muted">칼럼리스트</span>
          </span>
        </a>
        {mine ? (
          <a className="btn" href={href}>
            내 프로필
          </a>
        ) : (
          <button type="button" className={profile.following ? 'btn' : 'btn btn-primary'} aria-pressed={profile.following} disabled={busy} onClick={() => void toggleFollow()}>
            {profile.following ? '팔로잉' : '팔로우'}
          </button>
        )}
      </div>
      {profile.bio && <p className="author-card__bio">{profile.bio}</p>}
      {club && (
        <p className="author-card__club">
          <ClubBadge club={club} size={20} />
          <span>
            <span className="muted">응원 구단</span> {club.name}
          </span>
        </p>
      )}
      <dl className="author-card__stats">
        <div>
          <dd>{profile.postCount.toLocaleString('ko-KR')}</dd>
          <dt>칼럼</dt>
        </div>
        <div>
          <dd>{profile.followerCount.toLocaleString('ko-KR')}</dd>
          <dt>팔로워</dt>
        </div>
        <div>
          <dd>{profile.likeCount.toLocaleString('ko-KR')}</dd>
          <dt>받은 좋아요</dt>
        </div>
      </dl>
      {error && (
        <p className="feed-error" role="alert">
          {error}
        </p>
      )}
      {ask && <LoginNote what="팔로우는" onClose={() => setAsk(false)} />}
    </section>
  )
}
