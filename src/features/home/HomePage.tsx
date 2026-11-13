import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState, type FormEvent } from 'react'
import { ListIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from '../../components/icons'
import { Logo } from '../../components/Logo'
import { db } from '../../db/db'
import { createColumn, deleteTeam, saveTeam } from '../../db/store'
import { navigate, toHash } from '../../lib/router'
import { canSync, useAccount } from '../account'
import { openLogin } from '../account/loginPrompt'
import { displayName, FEED_LIMITS, FeedPane, RingAvatar } from '../feed'
import { ColumnCard } from './ColumnCard'
import { SettingsDrawer } from './SettingsDrawer'
import './home.css'

type Tab = 'feed' | 'mine'

export function HomePage({ initialQuery = '' }: { initialQuery?: string } = {}) {
  const columns = useLiveQuery(() => db.columns.orderBy('updatedAt').reverse().toArray())
  const teams = useLiveQuery(() => db.teams.toArray()) ?? []
  const account = useAccount()
  // 서버 설정이 없으면 피드가 없다. 그때는 내 칼럼이 첫 화면이다.
  const serverOn = account.status !== 'off'
  const signedIn = account.status === 'in' && canSync(account)
  const [picked, setPicked] = useState<Tab | null>(null)
  const tab: Tab = picked === 'feed' && !serverOn ? 'mine' : (picked ?? (serverOn ? 'feed' : 'mine'))
  const [filter, setFilter] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [teamColor, setTeamColor] = useState('#12b886')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  // draft: 검색창에 적는 중인 말, query: 찾기를 누른 말
  const [draft, setDraft] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  // 이름이나 로고를 누를 때마다 올라간다. 피드를 처음 상태로 다시 그리고 새로 불러오게 한다.
  const [refresh, setRefresh] = useState(0)

  const teamById = new Map(teams.map((t) => [t.id, t]))
  const visible = (columns ?? []).filter((c) => filter === null || c.teamId === filter)
  const best = visible.find((c) => c.isBest)
  const rest = visible.filter((c) => c !== best)

  const write = async () => {
    const column = await createColumn()
    navigate({ name: 'write', id: column.id })
  }

  const addTeam = async (e: FormEvent) => {
    e.preventDefault()
    const name = teamName.trim()
    if (!name) return
    await saveTeam({ name, color: teamColor })
    setTeamName('')
  }

  const removeTeam = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" 팀을 삭제할까요? 이 팀의 칼럼은 팀 없음으로 바뀝니다.`)) return
    if (filter === id) setFilter(null)
    await deleteTeam(id)
  }

  const search = (e: FormEvent) => {
    e.preventDefault()
    setQuery(draft.trim())
    setPicked('feed')
  }

  const clearSearch = () => {
    setDraft('')
    setQuery('')
    // 다른 화면의 검색창에서 넘어왔으면 주소의 검색어도 지운다.
    if (initialQuery) navigate({ name: 'home' })
  }

  // 이름·로고: 첫 화면으로 돌아가 새로 고친다 (검색과 고른 리그·구단·순서를 풀고, 맨 위로 올라가 글을 다시 불러온다).
  const goHome = () => {
    clearSearch()
    setPicked(null)
    setFilter(null)
    setRefresh((n) => n + 1)
    window.scrollTo({ top: 0 })
  }

  const tabButton = (value: Tab, label: string) => (
    <button type="button" role="tab" id={`home-tab-${value}`} aria-selected={tab === value} aria-controls="home-panel" onClick={() => setPicked(value)}>
      {label}
    </button>
  )

  return (
    <main className="home">
      {/* 맨 위: 이름 | 검색 | 로그인·내 계정·메뉴 */}
      <header className="home-top">
        {/* 이름 옆에 피드 / 내 칼럼을 둔다. 따로 한 줄을 쓰지 않는다. */}
        <div className="home-top__start">
          <h1 className="home-brand">
            <button type="button" className="home-brand__button" title="처음 화면으로 돌아가 새로 고침" onClick={goHome}>
              <Logo size={28} />
              <span lang="en">HIGH PRESS</span>
            </button>
          </h1>
          <nav className="seg home-tabs" role="tablist" aria-label="홈 화면">
            {serverOn && tabButton('feed', '피드')}
            {tabButton('mine', '내 칼럼')}
          </nav>
        </div>

        {serverOn ? (
          <form className="home-search" role="search" onSubmit={search}>
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            <label className="sr-only" htmlFor="home-search">
              칼럼과 칼럼리스트 찾기
            </label>
            <input
              id="home-search"
              type="search"
              placeholder="칼럼과 칼럼리스트 찾기"
              value={draft}
              maxLength={FEED_LIMITS.query}
              onChange={(event) => setDraft(event.target.value)}
            />
            {draft && (
              <button type="button" className="icon-btn icon-btn--sm" aria-label="검색어 지우기" onClick={clearSearch}>
                <XIcon size={14} aria-hidden="true" />
              </button>
            )}
          </form>
        ) : (
          <span />
        )}

        <div className="home-top__end">
          {account.status === 'in' && signedIn && (
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
          {account.status === 'in' && !signedIn && (
            <button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(true)}>
              가입 마치기
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="메뉴" title="메뉴" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
            <ListIcon size={22} aria-hidden="true" />
          </button>
        </div>
      </header>


      <div id="home-panel" role="tabpanel" aria-labelledby={`home-tab-${tab}`}>
        {tab === 'feed' && <FeedPane key={refresh} query={query} onClearQuery={clearSearch} />}

        {tab === 'mine' && (
          <section className="mine" aria-label="내 칼럼">
            <p className="home-notice">칼럼과 사진은 이 브라우저에 저장됩니다. 브라우저 데이터를 지우면 사라지니 메뉴의 백업 내보내기로 정기적으로 보관해 주세요.</p>

            <div className="team-bar" role="group" aria-label="팀 필터">
              <button type="button" className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
                전체
              </button>
              {teams.map((t) => (
                <span key={t.id} className="team-chip">
                  <button type="button" className="chip" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
                    <span className="team-dot" style={{ background: t.color }} aria-hidden="true" />
                    {t.name}
                  </button>
                  <button type="button" className="chip-remove" aria-label={`${t.name} 팀 삭제`} onClick={() => removeTeam(t.id, t.name)}>
                    <XIcon size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <form className="team-form" onSubmit={addTeam}>
              <label className="sr-only" htmlFor="team-name">
                새 팀 이름
              </label>
              <input id="team-name" className="field" placeholder="새 팀 이름" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={30} />
              <label className="sr-only" htmlFor="team-color">
                팀 색상
              </label>
              <input id="team-color" type="color" value={teamColor} onChange={(e) => setTeamColor(e.target.value)} />
              <button type="submit" className="btn" disabled={!teamName.trim()}>
                팀 추가
              </button>
            </form>

            {columns && columns.length === 0 && (
              <div className="empty-state">
                <h2>아직 쓴 칼럼이 없어요</h2>
                <p className="muted">아래 + 버튼을 눌러 첫 칼럼을 시작해 보세요.</p>
              </div>
            )}
            {columns && columns.length > 0 && visible.length === 0 && (
              <div className="empty-state">
                <p className="muted">이 팀의 칼럼이 없습니다.</p>
              </div>
            )}

            {best && <ColumnCard column={best} team={best.teamId ? teamById.get(best.teamId) : undefined} best />}
            {rest.length > 0 && (
              <div className="column-grid">
                {rest.map((c) => (
                  <ColumnCard key={c.id} column={c} team={c.teamId ? teamById.get(c.teamId) : undefined} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <button type="button" className="fab" aria-label="글쓰기" title="글쓰기" onClick={write}>
        <PlusIcon size={24} weight="bold" aria-hidden="true" />
      </button>

      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </main>
  )
}
