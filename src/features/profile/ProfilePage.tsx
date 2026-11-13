import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { ArrowLeftIcon, CameraIcon } from '../../components/icons'
import { avatarUrl, makeAvatar } from '../../lib/avatar'
import { CLUBS, LEAGUES, clubOf } from '../../lib/clubs'
import { canSync, useAccount } from '../account'
import { setMyAvatar } from '../account/session'
import { ModerationMenu } from '../moderation/ModerationMenu'
import { useOwn } from '../moderation/useOwn'
import { displayName, FEED_LIMITS, FeedError, feedSafetyText, getFeedRemote, isOnline, LoginNote, PostList, RingAvatar, usePosts, type FeedProfile } from '../feed'
import '../feed/feed.css'
import './profile.css'

function actionErrorText(cause: unknown, fallback: string): string {
  // 금칙어 · 이용 정지 · 차단으로 거절됐으면 그 까닭을 그대로 알린다.
  const safety = feedSafetyText(cause)
  if (safety) return safety
  if (cause instanceof FeedError && cause.code === 'quota') return `팔로우는 ${FEED_LIMITS.follows}명까지 할 수 있습니다.`
  if (cause instanceof FeedError && cause.code === 'full') return '서버가 한도에 닿아 지금은 새 팔로우를 받지 않습니다.'
  if (cause instanceof FeedError && cause.code === 'outdated') return '이 기능은 서버 설정(0004_social.sql, 프로필 사진은 0011_avatar.sql)을 마친 뒤 쓸 수 있습니다.'
  return fallback
}

// 맨 위 줄: 뒤로 | 프로필 | (남의 프로필이면) ⋯ 메뉴
function ProfileTop({ menu }: { menu?: ReactNode }) {
  return (
    <header className="profile-top">
      <a className="icon-btn" href="#/" aria-label="홈으로" title="홈으로">
        <ArrowLeftIcon size={20} aria-hidden="true" />
      </a>
      <span className="profile-top__title">프로필</span>
      {menu}
    </header>
  )
}

function EditForm({ profile, onSaved, onCancel }: { profile: FeedProfile; onSaved: (patch: { bio: string; club: string | null; avatar: string | null }) => void; onCancel: () => void }) {
  const [bio, setBio] = useState(profile.bio)
  const [club, setClub] = useState(clubOf(profile.club)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bioId = useId()
  const clubId = useId()
  const photoId = useId()
  // undefined: 사진을 그대로 둔다, null: 사진을 뺀다, Blob: 새로 고른 사진 (올릴 크기로 줄인 것)
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined)
  // 미리 보기. 새로 고른 사진은 기기 안의 주소로, 그대로 둔 사진은 서버의 주소로 보여 준다.
  const picked = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked)
  }, [picked])
  const preview = photo === undefined ? avatarUrl(profile.avatar) : picked

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 반응하게 비워 둔다.
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      setPhoto(await makeAvatar(file))
    } catch {
      setError('이 사진은 쓸 수 없습니다. JPG, PNG, WebP 사진을 골라 주세요.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const patch = { bio: bio.trim().slice(0, FEED_LIMITS.bio), club: club || null }
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await remote.saveProfile(profile.userId, patch)
      // 사진을 건드리지 않았으면 그대로 둔다.
      const avatar = photo === undefined ? profile.avatar : await remote.saveAvatar(profile.userId, photo, profile.avatar)
      if (photo !== undefined) setMyAvatar(avatar)
      onSaved({ ...patch, avatar })
    } catch (cause) {
      setError(actionErrorText(cause, '프로필을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="profile-form" onSubmit={(event) => void submit(event)}>
      <div className="profile-field">
        <span id={`${photoId}-label`}>프로필 사진</span>
        <div className="profile-photo" role="group" aria-labelledby={`${photoId}-label`}>
          <span className="avatar profile-photo__preview" aria-hidden="true">
            {preview ? <img src={preview} alt="" /> : Array.from(displayName(profile.nickname))[0]}
          </span>
          <label className="btn profile-photo__pick" htmlFor={photoId}>
            <CameraIcon size={18} aria-hidden="true" />
            {preview ? '사진 바꾸기' : '사진 고르기'}
          </label>
          <input id={photoId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void choose(event)} />
          {preview && (
            <button type="button" className="btn btn-ghost" onClick={() => setPhoto(null)}>
              사진 빼기
            </button>
          )}
        </div>
        <span className="profile-hint muted">가운데를 정사각형으로 잘라 작게 줄인 사본만 올라갑니다. 누구에게나 보이며, 남의 사진을 쓰는 책임은 올리는 사람에게 있습니다.</span>
      </div>
      <div className="profile-field">
        <label htmlFor={bioId}>한 줄 소개</label>
        <input id={bioId} className="field" value={bio} maxLength={FEED_LIMITS.bio} placeholder="어떤 글을 쓰는지 적어 주세요" onChange={(event) => setBio(event.target.value)} />
        <span className="profile-hint muted">
          {bio.length}/{FEED_LIMITS.bio}자. 로그인하지 않은 사람을 포함해 누구에게나 보입니다.
        </span>
      </div>
      <div className="profile-field">
        <label htmlFor={clubId}>응원 구단</label>
        <select id={clubId} className="field" value={club} onChange={(event) => setClub(event.target.value)}>
          <option value="">없음</option>
          {LEAGUES.map((league) => (
            <optgroup key={league} label={league}>
              {CLUBS.filter((item) => item.league === league).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {error && (
        <p className="feed-error" role="alert">
          {error}
        </p>
      )}
      <div className="profile-form__actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          저장
        </button>
      </div>
    </form>
  )
}

function Profile({ me, userId }: { me: string; userId: string }) {
  // undefined: 불러오는 중, null: 없는 사람
  const [profile, setProfile] = useState<FeedProfile | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  // 로그인하지 않은 사람이 로그인해야 하는 일을 눌렀을 때 띄우는 안내
  const [ask, setAsk] = useState('')
  const feed = usePosts({ author: userId })
  // 이 사람을 차단했다. 프로필과 글을 거둔다.
  const [blocked, setBlocked] = useState(false)
  // me 가 빈 글자면 로그인하지 않은 사람이다. 읽을 수만 있다.
  const mine = me !== '' && userId === me
  // 로그인한 계정의 프로필이면 (가입 마침과 상관없이) 신고 · 차단 메뉴를 붙이지 않는다.
  const own = useOwn()(userId)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    setLoadError('')
    getFeedRemote()
      .then((remote) => (remote ? remote.profile(userId) : Promise.reject(new FeedError('failed'))))
      .then((loaded) => {
        if (!cancelled) setProfile(loaded)
      })
      .catch((cause) => {
        if (cancelled) return
        setProfile(null)
        setLoadError(cause instanceof FeedError && cause.code === 'denied' ? '지금은 로그인해야 프로필을 볼 수 있습니다.' : actionErrorText(cause, '프로필을 불러오지 못했습니다. 주소가 맞는지 확인해 주세요.'))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const toggleFollow = async () => {
    if (!profile || busy) return
    if (!me) {
      setAsk('팔로우는')
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
      setError(actionErrorText(cause, '팔로우를 반영하지 못했습니다. 잠시 뒤 다시 눌러 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  if (profile === undefined) {
    return (
      <>
        <ProfileTop />
        <div className="profile-head profile-head--loading" role="status" aria-label="프로필을 불러오는 중">
          <span className="profile-ghost profile-ghost--avatar" />
          <span className="profile-ghost" />
          <span className="profile-ghost profile-ghost--short" />
        </div>
      </>
    )
  }

  if (profile === null) {
    return (
      <>
        <ProfileTop />
        <div className="feed-empty">
          <h2>프로필을 찾을 수 없습니다</h2>
          <p className="muted">{loadError || '탈퇴했거나 없는 사람입니다.'}</p>
        </div>
      </>
    )
  }

  if (blocked) {
    return (
      <>
        <ProfileTop />
        <div className="feed-empty" role="status">
          <h2>{displayName(profile.nickname)}님을 차단했습니다</h2>
          <p className="muted">이 사람의 글과 댓글은 더 보이지 않습니다. 설정의 “차단한 사람”에서 풀 수 있습니다.</p>
          <a className="btn" href="#/">
            피드로 돌아가기
          </a>
        </div>
      </>
    )
  }

  const club = clubOf(profile.club)
  const name = displayName(profile.nickname)
  const online = mine || isOnline(profile)
  const stats: [string, number][] = [
    ['칼럼', profile.postCount],
    ['팔로워', profile.followerCount],
    ['팔로잉', profile.followingCount],
    ['받은 좋아요', profile.likeCount],
  ]

  const menu = mine || own ? undefined : (
    <ModerationMenu
      me={me}
      label="프로필 메뉴"
      person={{ userId, name }}
      reports={[
        { kind: 'user', targetId: userId, label: '사용자', preview: name },
        ...(profile.avatar ? [{ kind: 'user' as const, targetId: userId, part: 'avatar' as const, label: '프로필 사진', preview: name }] : []),
      ]}
      onBlocked={() => setBlocked(true)}
    />
  )

  return (
    <>
      <ProfileTop menu={menu} />
      <section className="profile-head" aria-label="프로필">
        <RingAvatar name={profile.nickname} size={96} fresh={profile.fresh} online={online} src={profile.avatar} />
        <h1 className="profile-name">{name}</h1>
        <p className="profile-state muted">
          {/* 로그인하지 않은 사람에게는 접속 여부를 알려 주지 않는다. */}
          {me ? (online ? '접속 중' : '지금은 자리에 없음') : '칼럼리스트'}
          {profile.fresh && ' · 최근 7일 안에 새 글'}
        </p>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {club && (
          <p className="profile-club">
            <ClubBadge club={club} size={24} />
            <span>
              <span className="muted">응원 구단</span> {club.name}
            </span>
          </p>
        )}

        <dl className="profile-stats">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dd>{value.toLocaleString('ko-KR')}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>

        {mine ? (
          !editing && (
            <button type="button" className="btn profile-action" onClick={() => setEditing(true)}>
              프로필 고치기
            </button>
          )
        ) : (
          <button type="button" className={profile.following ? 'btn profile-action' : 'btn btn-primary profile-action'} aria-pressed={profile.following} disabled={busy} onClick={() => void toggleFollow()}>
            {profile.following ? '팔로잉' : '팔로우'}
          </button>
        )}
        {error && (
          <p className="feed-error" role="alert">
            {error}
          </p>
        )}
        {ask && <LoginNote what={ask} onClose={() => setAsk('')} />}
        {mine && editing && (
          <EditForm
            profile={profile}
            onCancel={() => setEditing(false)}
            onSaved={(patch) => {
              setProfile({ ...profile, ...patch })
              setEditing(false)
            }}
          />
        )}
      </section>

      <section className="feed profile-posts" aria-labelledby="profile-posts-title">
        <h2 id="profile-posts-title" className="profile-posts__title">
          {mine ? '내가 올린 칼럼' : `${name} 님의 칼럼`}
        </h2>
        {feed.error && (
          <p className="feed-error" role="alert">
            {feed.error}
          </p>
        )}
        {feed.posts !== null && feed.posts.length === 0 && !feed.error && (
          <div className="feed-empty">
            <p className="muted">{mine ? '아직 피드에 올린 칼럼이 없습니다. 내 칼럼에서 “피드에 올리기”를 눌러 보세요.' : '아직 올린 칼럼이 없습니다.'}</p>
          </div>
        )}
        <PostList posts={feed.posts} me={me} linkAuthor={false} onLike={(target) => (me ? void feed.like(target) : setAsk('좋아요는'))} onRemove={(target) => void feed.remove(target)} onBlocked={() => setBlocked(true)} />
        {feed.more && feed.posts && feed.posts.length > 0 && (
          <button type="button" className="btn feed-more" onClick={() => void feed.loadMore()}>
            더 보기
          </button>
        )}
      </section>
    </>
  )
}

// 칼럼리스트 한 사람의 프로필: 팔로우 버튼과 그 사람이 올린 칼럼. 읽기는 누구나 하고, 팔로우와 좋아요는 가입자만 한다.
export function ProfilePage({ userId }: { userId: string }) {
  const account = useAccount()
  const signedIn = account.status === 'in' && canSync(account)

  return (
    <main className="profile">
      {account.status === 'off' ? (
        <>
          <ProfileTop />
          <div className="feed">
            <div className="feed-empty">
              <h2>칼럼리스트 프로필</h2>
              <p className="muted">서버 설정이 없어 프로필을 볼 수 없습니다.</p>
            </div>
          </div>
        </>
      ) : account.status === 'loading' ? (
        <>
          <ProfileTop />
          <div className="profile-head profile-head--loading" role="status" aria-label="프로필을 불러오는 중">
            <span className="profile-ghost profile-ghost--avatar" />
            <span className="profile-ghost" />
            <span className="profile-ghost profile-ghost--short" />
          </div>
        </>
      ) : (
        // 로그인하거나 로그아웃하면 처음부터 다시 읽는다.
        <Profile key={signedIn ? account.userId : ''} me={signedIn && account.status === 'in' ? account.userId : ''} userId={userId} />
      )}
    </main>
  )
}
