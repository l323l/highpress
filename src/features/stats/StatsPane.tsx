import { useRef, useState } from 'react'
import { loadCurrent, loadPast, loadPastMatch, loadPastMatches, STATS_ERROR_TEXT, StatsError, type CurrentKind, type PastKind } from './api'
import { LEAGUES, PAST_SEASONS, seasonLabel } from '@highpress/core/stats'
import type { MatchOption, StatSnapshot } from '@highpress/core/stats'
import { StatChart } from './StatChart'
import { StatSites } from './StatSites'
import './stats.css'

type Tab = 'insert' | 'sites'
type Scope = 'current' | 'past'
type Kind = CurrentKind | PastKind

interface Query {
  scope: Scope
  league: string
  season: number
  kind: Kind | null
  // 0이면 전체
  limit: number
  round: string
  matchId: number | null
}

const KINDS: Record<Scope, { kind: Kind; label: string }[]> = {
  current: [
    { kind: 'standings', label: '순위표' },
    { kind: 'scorers', label: '득점 순위' },
    { kind: 'results', label: '최근 경기 결과' },
  ],
  past: [
    { kind: 'standings', label: '순위표' },
    { kind: 'scorers', label: '득점 순위' },
    { kind: 'match', label: '경기 스탯 비교' },
  ],
}

const LIMITS = [
  { value: 0, label: '전체' },
  { value: 5, label: '상위 5' },
  { value: 10, label: '상위 10' },
]

const INITIAL: Query = { scope: 'current', league: LEAGUES[0].code, season: PAST_SEASONS[0], kind: null, limit: 0, round: '', matchId: null }

export interface StatsPaneProps {
  // 고른 스탯 도표를 본문에 넣는다.
  onInsert?: (snapshot: StatSnapshot) => void
}

export function StatsPane({ onInsert }: StatsPaneProps) {
  const [tab, setTab] = useState<Tab>('insert')
  const [query, setQuery] = useState<Query>(INITIAL)
  const [snapshot, setSnapshot] = useState<StatSnapshot | null>(null)
  // 같은 도표를 다시 골라도 애니메이션이 처음부터 돌도록 미리보기를 새로 만든다.
  const [shown, setShown] = useState(0)
  // 경기 스탯 비교에서 빼기로 한 항목. 새 도표를 불러오면 비운다.
  const [excluded, setExcluded] = useState<string[]>([])
  const [matches, setMatches] = useState<{ key: string; options: MatchOption[] }>({ key: '', options: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  // 늦게 도착한 응답이 나중에 고른 것을 덮어쓰지 않게 한다.
  const ticket = useRef(0)

  const run = async (next: Query) => {
    setQuery(next)
    setError('')
    setNote('')
    const mine = ++ticket.current
    if (!next.kind) {
      setSnapshot(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      let result: StatSnapshot | null = null
      const limit = next.limit || undefined
      if (next.scope === 'current') {
        result = await loadCurrent(next.kind as CurrentKind, next.league, limit)
      } else if (next.kind === 'match') {
        const key = `${next.league}/${next.season}`
        if (matches.key !== key) {
          const options = await loadPastMatches(next.league, next.season)
          if (mine === ticket.current) setMatches({ key, options })
        }
        if (next.matchId) result = await loadPastMatch(next.league, next.matchId)
      } else {
        result = await loadPast(next.kind as 'standings' | 'scorers', next.league, next.season, limit)
      }
      if (mine !== ticket.current) return
      setSnapshot(result)
      setExcluded([])
      setShown((count) => count + 1)
    } catch (cause) {
      if (mine !== ticket.current) return
      setSnapshot(null)
      setError(cause instanceof StatsError ? cause.message : STATS_ERROR_TEXT.upstream)
    } finally {
      if (mine === ticket.current) setLoading(false)
    }
  }

  const change = (patch: Partial<Query>) => void run({ ...query, ...patch })
  // 리그·시즌이 바뀌면 고른 경기는 더 이상 맞지 않는다.
  const changeSource = (patch: Partial<Query>) => change({ ...patch, round: '', matchId: null })

  const matchKey = `${query.league}/${query.season}`
  const options = matches.key === matchKey ? matches.options : []
  const rounds = [...new Set(options.map((match) => match.round))]
  const round = query.round || rounds[0] || ''
  const pickingMatch = query.scope === 'past' && query.kind === 'match'

  // 경기 스탯 비교는 원하는 항목만 골라 넣을 수 있다.
  const pickable = snapshot?.view === 'versus' ? snapshot.rows.map((row) => String(row[0])) : []
  const chosen = snapshot && pickable.length > 0 ? { ...snapshot, rows: snapshot.rows.filter((row) => !excluded.includes(String(row[0]))) } : snapshot
  const nothingChosen = chosen !== null && chosen.rows.length === 0
  const toggle = (label: string) => {
    setExcluded((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]))
    setNote('')
  }

  return (
    <div className="stats-pane">
      <div className="stats-tabs" role="tablist" aria-label="스탯">
        <button type="button" role="tab" className="chip" aria-selected={tab === 'insert'} onClick={() => setTab('insert')}>
          스탯 넣기
        </button>
        <button type="button" role="tab" className="chip" aria-selected={tab === 'sites'} onClick={() => setTab('sites')}>
          추천 사이트
        </button>
      </div>

      {tab === 'sites' ? (
        <StatSites />
      ) : (
        <>
          <div className="stats-row">
            <div className="stats-seg" role="group" aria-label="시즌 범위">
              <button type="button" className="chip" aria-pressed={query.scope === 'current'} onClick={() => changeSource({ scope: 'current', kind: null })}>
                이번 시즌
              </button>
              <button type="button" className="chip" aria-pressed={query.scope === 'past'} onClick={() => changeSource({ scope: 'past', kind: null })}>
                지난 시즌
              </button>
            </div>
            <select className="field" aria-label="리그" value={query.league} onChange={(event) => changeSource({ league: event.target.value })}>
              {LEAGUES.map((league) => (
                <option key={league.code} value={league.code}>
                  {league.name}
                </option>
              ))}
            </select>
            {query.scope === 'past' && (
              <select className="field" aria-label="시즌" value={query.season} onChange={(event) => changeSource({ season: Number(event.target.value) })}>
                {PAST_SEASONS.map((season) => (
                  <option key={season} value={season}>
                    {seasonLabel(season)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="stats-row">
            <div className="stats-seg" role="group" aria-label="스탯 항목">
              {KINDS[query.scope].map((item) => (
                <button key={item.kind} type="button" className="chip" aria-pressed={query.kind === item.kind} onClick={() => change({ kind: item.kind })}>
                  {item.label}
                </button>
              ))}
            </div>
            {query.kind && query.kind !== 'match' && query.kind !== 'results' && (
              <select className="field" aria-label="표시 범위" value={query.limit} onChange={(event) => change({ limit: Number(event.target.value) })}>
                {LIMITS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {pickingMatch && options.length > 0 && (
            <div className="stats-row">
              <select className="field" aria-label="라운드" value={round} onChange={(event) => change({ round: event.target.value, matchId: null })}>
                {rounds.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select className="field stats-match" aria-label="경기" value={query.matchId ?? ''} onChange={(event) => change({ round, matchId: Number(event.target.value) || null })}>
                <option value="">경기를 고르세요</option>
                {options
                  .filter((match) => match.round === round)
                  .map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.label}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* 넣기 버튼은 도표 위, 항목 고르기 바로 옆에 둔다. 도표가 길어도 가려지지 않는다. */}
          <div className="stats-row stats-pick">
            {!loading && pickable.length > 0 && (
              <div className="stats-pick-group" role="group" aria-label="넣을 항목">
                <span className="muted stats-hint">넣을 항목</span>
                {pickable.map((label) => (
                  <label key={label} className="stats-check">
                    <input type="checkbox" checked={!excluded.includes(label)} onChange={() => toggle(label)} />
                    <span>{label}</span>
                  </label>
                ))}
                <button type="button" className="btn btn-ghost" onClick={() => setExcluded([])}>
                  전체 선택
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setExcluded(pickable)}>
                  전체 해제
                </button>
              </div>
            )}
            {onInsert && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!chosen || nothingChosen || loading}
                onClick={() => {
                  if (!chosen || nothingChosen) return
                  onInsert(chosen)
                  setNote('본문에 넣었습니다.')
                }}
              >
                본문에 넣기
              </button>
            )}
            {note && (
              <span className="stats-note" role="status">
                {note}
              </span>
            )}
          </div>

          <div className="stats-preview" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <p className="muted">불러오는 중…</p>
            ) : error ? (
              <p className="stats-error" role="alert">
                {error}
              </p>
            ) : chosen && nothingChosen ? (
              <p className="muted">넣을 항목을 하나 이상 고르세요.</p>
            ) : chosen ? (
              <StatChart key={shown} snapshot={chosen} />
            ) : (
              <p className="muted">{pickingMatch ? '라운드와 경기를 고르면 두 팀의 기록을 비교해 보여 줍니다.' : '스탯 항목을 고르면 도표가 여기에 나타납니다.'}</p>
            )}
          </div>

          <p className="muted stats-hint stats-source">
            {query.scope === 'current' ? '이번 시즌 · 출처 football-data.org (결과 반영이 늦을 수 있음)' : '2022-23 ~ 2024-25 시즌 · 출처 API-Football'}
          </p>
        </>
      )}
    </div>
  )
}
