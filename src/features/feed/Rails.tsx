import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { LeagueFlag } from '../../components/LeagueFlag'
import { clubsIn, LEAGUE_COUNTRY, LEAGUES } from '../../lib/clubs'
import { toHash } from '../../lib/router'
import { avatarUrl } from '../../lib/avatar'
import { displayName, isOnline } from './helpers'
import { getFeedRemote } from './remote'
import type { FeedPerson } from '@highpress/core/feed'

// 프로필 사진이 있으면 사진을, 없거나 받지 못하면 이름 첫 글자를 보여 준다. src 는 보관함 안의 위치다.
export function Avatar({ name, size = 40, src = null }: { name: string; size?: number; src?: string | null }) {
  const url = avatarUrl(src)
  // 받지 못한 사진의 주소. 사진이 바뀌면 다시 받아 본다.
  const [broken, setBroken] = useState<string | null>(null)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {url && broken !== url ? <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(url)} /> : Array.from(displayName(name))[0]}
    </span>
  )
}

// 고리가 있는 아바타. fresh: 최근 7일 안에 새 글을 올렸다(색 고리), online: 접속 중(점).
export function RingAvatar({ name, size = 48, fresh = false, online = false, src = null }: { name: string; size?: number; fresh?: boolean; online?: boolean; src?: string | null }) {
  return (
    <span className="ring" data-fresh={fresh || undefined}>
      <Avatar name={name} size={size} src={src} />
      {online && <span className="ring-dot" aria-hidden="true" />}
    </span>
  )
}

interface ClubRailProps {
  league: string | null
  club: string | null
  // 리그를 고른다. null 이면 전체.
  onLeague: (league: string | null) => void
  // 구단을 고른다. null 이면 고른 리그 전체(리그도 없으면 전체).
  onClub: (club: string | null) => void
}

// 리그별로 거르기. 전체가 기본이고, 그때는 모든 구단이 리그별로 묶여 한 줄에 놓인다 (프리미어리그 | 라리가 | …).
// 리그를 누르면 그 리그의 글이 보이며 구단 줄에는 그 리그의 구단만 남는다.
export function ClubRail({ league, club, onLeague, onClub }: ClubRailProps) {
  const shown = league ? [league] : LEAGUES
  const all = league === null
  // 차례로 올라오는 순서는 묶음을 넘어 이어진다.
  let order = 0
  return (
    <div className="league-rail">
      <div className="league-tabs" role="group" aria-label="리그별로 보기">
        <button type="button" className="league-tab league-tab--all" aria-pressed={league === null} onClick={() => onLeague(null)}>
          전체
        </button>
        <span className="league-split" aria-hidden="true" />
        {LEAGUES.map((name) => (
          <button key={name} type="button" className="league-tab" aria-pressed={league === name} aria-expanded={league === name} onClick={() => onLeague(league === name ? null : name)}>
            {LEAGUE_COUNTRY[name] && <LeagueFlag country={LEAGUE_COUNTRY[name]} />}
            {name}
          </button>
        ))}
      </div>

      <div key={league ?? 'all'} className="club-rail" data-all={all || undefined}>
        {shown.map((name, groupIndex) => (
          <Fragment key={name}>
            {groupIndex > 0 && <span className="club-split" aria-hidden="true" />}
            <div className="club-group" role="group" aria-label={`${name} 구단`}>
              {clubsIn(name).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="club-pick"
                  style={{ '--i': order++ } as CSSProperties}
                  aria-pressed={club === item.id}
                  title={item.name}
                  onClick={() => onClub(club === item.id ? null : item.id)}
                >
                  <span className="club-ring">
                    <ClubBadge club={item} size={all ? 44 : 52} />
                  </span>
                  <span className="club-name" aria-hidden="true">
                    {item.short}
                  </span>
                  <span className="sr-only">{item.name}</span>
                </button>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// 인기 칼럼리스트: 최근 30일 동안 받은 좋아요 순. 누르면 그 사람의 프로필로 간다.
// 처음에 보여 주는 사람 수. 나머지는 "더 보기"로 편다.
const POPULAR_SHOWN = 5

export function PopularRail({ me, reloads }: { me: string; reloads: number }) {
  // null: 불러오는 중
  const [people, setPeople] = useState<FeedPerson[] | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.popular() : []))
      .catch(() => [] as FeedPerson[])
      .then((loaded) => {
        if (!cancelled) setPeople(loaded)
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  return (
    <aside className="popular" aria-labelledby="popular-title" data-empty={people?.length === 0 || undefined}>
      <h2 id="popular-title" className="popular-title">
        인기 칼럼리스트
      </h2>
      <p className="popular-sub muted">최근 30일 동안 받은 좋아요 순</p>
      {people === null && <p className="popular-note muted">불러오는 중…</p>}
      {people?.length === 0 && <p className="popular-note muted">아직 칼럼을 올린 사람이 없습니다. 첫 글을 올리면 여기에 보입니다.</p>}
      {people && people.length > 0 && (
        <ol className="popular-list" data-all={all || undefined}>
          {people.map((person, index) => {
            const online = person.userId === me || isOnline(person)
            const name = displayName(person.nickname)
            return (
              <li key={person.userId} style={{ '--i': index } as CSSProperties}>
                <a className="popular-item" href={toHash({ name: 'profile', id: person.userId })}>
                  <RingAvatar name={person.nickname} size={34} fresh={person.fresh} online={online} src={person.avatar} />
                  <span className="popular-text">
                    <span className="popular-name">{person.userId === me ? `${name} (나)` : name}</span>
                    <span className="popular-meta muted">
                      좋아요 {person.likeCount.toLocaleString('ko-KR')}
                      {person.fresh && <span className="popular-fresh">새 글</span>}
                      {online && <span className="sr-only">접속 중</span>}
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
      {people && people.length > POPULAR_SHOWN && (
        <button type="button" className="popular-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? '접기' : '더 보기'}
        </button>
      )}
    </aside>
  )
}
