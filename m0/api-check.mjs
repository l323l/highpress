// M4: 축구 API 무료 플랜이 현재 시즌에 무엇을 주는지 실제 키로 확인한다.
// 실행: node --env-file-if-exists=.env.local m0/api-check.mjs
// .env.local 에 FOOTBALL_DATA_TOKEN, API_FOOTBALL_KEY 를 넣는다 (있는 것만 확인한다).
// 키와 응답 본문 전체는 출력하지 않는다. API-Football은 하루 100회 중 5회를 쓴다.

const report = {}

async function call(url, headers) {
  try {
    const response = await fetch(url, { headers })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text.slice(0, 200) }
    }
    return { status: response.status, headers: response.headers, body }
  } catch (error) {
    return { status: 0, headers: new Headers(), body: { error: String(error) } }
  }
}

async function footballData(token) {
  const base = 'https://api.football-data.org/v4'
  const get = (path) => call(base + path, { 'X-Auth-Token': token })
  const out = {}

  const competitions = await get('/competitions')
  out.competitions = {
    status: competitions.status,
    count: competitions.body.competitions?.length ?? null,
    codes: competitions.body.competitions?.map((c) => c.code).join(' ') ?? competitions.body.message,
    perMinuteLeft: competitions.headers.get('x-requests-available-minute'),
  }

  const standings = await get('/competitions/PL/standings')
  const table = standings.body.standings?.[0]?.table
  out.standings = {
    status: standings.status,
    season: standings.body.season?.startDate ?? null,
    matchday: standings.body.season?.currentMatchday ?? null,
    rows: table?.length ?? null,
    first: table?.[0] ? `${table[0].team?.name} ${table[0].points}점` : standings.body.message,
  }

  const scorers = await get('/competitions/PL/scorers?limit=3')
  out.scorers = {
    status: scorers.status,
    top: scorers.body.scorers?.map((s) => `${s.player?.name} ${s.goals}`).join(', ') ?? scorers.body.message,
  }

  const matches = await get('/competitions/PL/matches?status=FINISHED')
  const last = matches.body.matches?.at(-1)
  out.matches = {
    status: matches.status,
    finished: matches.body.matches?.length ?? null,
    last: last ? `${last.utcDate} ${last.homeTeam?.shortName} ${last.score?.fullTime?.home}-${last.score?.fullTime?.away} ${last.awayTeam?.shortName}` : matches.body.message,
  }

  // 경기 상세(라인업·이벤트)는 무료 플랜에서 비어 있을 것으로 예상한다.
  if (last) {
    const match = await get(`/matches/${last.id}`)
    out.matchDetail = {
      status: match.status,
      hasLineup: Array.isArray(match.body.homeTeam?.lineup) && match.body.homeTeam.lineup.length > 0,
      hasGoals: Array.isArray(match.body.goals) && match.body.goals.length > 0,
      note: match.body.message ?? null,
    }
  }

  const team = await get('/teams/57')
  out.squad = { status: team.status, players: team.body.squad?.length ?? null, note: team.body.message ?? null }
  return out
}

async function apiFootball(key) {
  const base = 'https://v3.football.api-sports.io'
  const get = (path) => call(base + path, { 'x-apisports-key': key })
  const errors = (body) => (body.errors && Object.keys(body.errors).length > 0 ? JSON.stringify(body.errors) : null)
  const out = {}

  // /status 는 일일 한도에 포함되지 않는다.
  const status = await get('/status')
  const account = status.body.response
  out.account = {
    status: status.status,
    plan: account?.subscription?.plan ?? null,
    active: account?.subscription?.active ?? null,
    usedToday: account?.requests?.current ?? null,
    limitDay: account?.requests?.limit_day ?? null,
    errors: errors(status.body),
  }

  const league = await get('/leagues?id=39')
  const seasons = league.body.response?.[0]?.seasons ?? []
  const current = seasons.find((s) => s.current)
  out.league = {
    status: league.status,
    seasons: seasons.map((s) => s.year).join(' '),
    current: current?.year ?? null,
    coverage: current?.coverage ? JSON.stringify(current.coverage) : null,
    errors: errors(league.body),
  }

  const year = current?.year ?? new Date().getFullYear()
  const standings = await get(`/standings?league=39&season=${year}`)
  const table = standings.body.response?.[0]?.league?.standings?.[0]
  out.standingsCurrent = {
    status: standings.status,
    season: year,
    rows: table?.length ?? null,
    first: table?.[0] ? `${table[0].team?.name} ${table[0].points}점` : null,
    errors: errors(standings.body),
    dayLeft: standings.headers.get('x-ratelimit-requests-remaining'),
  }

  const fixtures = await get(`/fixtures?league=39&season=${year}&status=FT`)
  const last = fixtures.body.response?.at(-1)
  out.fixturesCurrent = {
    status: fixtures.status,
    finished: fixtures.body.response?.length ?? null,
    last: last ? `${last.fixture?.date} ${last.teams?.home?.name} ${last.goals?.home}-${last.goals?.away} ${last.teams?.away?.name}` : null,
    errors: errors(fixtures.body),
  }

  if (last) {
    const detail = await get(`/fixtures?id=${last.fixture.id}`)
    const fixture = detail.body.response?.[0]
    out.fixtureDetail = {
      status: detail.status,
      lineups: fixture?.lineups?.length ?? null,
      events: fixture?.events?.length ?? null,
      statistics: fixture?.statistics?.length ?? null,
      players: fixture?.players?.length ?? null,
      errors: errors(detail.body),
    }
  }

  const scorers = await get(`/players/topscorers?league=39&season=${year}`)
  out.topScorers = {
    status: scorers.status,
    top: scorers.body.response?.slice(0, 3).map((p) => `${p.player?.name} ${p.statistics?.[0]?.goals?.total}`).join(', ') ?? null,
    errors: errors(scorers.body),
    dayLeft: scorers.headers.get('x-ratelimit-requests-remaining'),
  }
  return out
}

const { FOOTBALL_DATA_TOKEN, API_FOOTBALL_KEY } = process.env
report.footballData = FOOTBALL_DATA_TOKEN ? await footballData(FOOTBALL_DATA_TOKEN) : 'FOOTBALL_DATA_TOKEN 없음 — 건너뜀'
report.apiFootball = API_FOOTBALL_KEY ? await apiFootball(API_FOOTBALL_KEY) : 'API_FOOTBALL_KEY 없음 — 건너뜀'
console.log(JSON.stringify(report, null, 2))
