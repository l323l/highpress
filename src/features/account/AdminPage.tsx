import { useEffect, useState } from 'react'
import '../legal/legal.css'
import { BannedWordsSection, ReportsSection } from '../moderation/AdminModeration'
import { useAccount } from './session'
import { dailySummary, LEVEL_TEXT, loadDailyActive, loadUsage, usageRows, type DailyActive, type DailyActiveError, type Usage, type UsageError } from './usage'
import './account.css'

const count = (n: number) => n.toLocaleString('ko-KR')

// 'YYYY-MM-DD' → '10월 16일 (목)'. 날짜만 있는 값이라 시간대가 바뀌지 않게 UTC로 읽는다.
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' })

const people = (n: number | null) => (n === null ? '-' : `${count(n)}명`)
const average = (n: number | null) => (n === null ? '-' : `${n.toFixed(1)}명`)

// 하루 방문자. 로그인하지 않은 사람까지 그날 앱을 연 브라우저 수와, 그중 로그인한 사람 수가 있다.
function DailyActiveSection({ result }: { result: DailyActive | DailyActiveError | null }) {
  let body
  if (result === null) body = <p className="muted">불러오는 중…</p>
  else if (result === 'missing')
    body = (
      <p>
        서버에 <code>0012_daily_active.sql</code> 과 <code>0013_daily_visitors.sql</code> 을 차례로 넣으면 그날부터 셉니다.
      </p>
    )
  else if (result === 'not-admin' || result === 'failed') body = <p role="alert">방문자 수를 불러오지 못했습니다.</p>
  else if (result.days.length === 0) body = <p className="muted">아직 센 날이 없습니다. 누군가 앱을 열면 그날부터 셉니다.</p>
  else {
    // 0013 을 넣기 전에는 로그인한 사람 수만 있으므로 그것을 크게 보여 준다.
    const main = dailySummary(result, result.hasVisitors ? 'visitors' : 'users')
    const signed = dailySummary(result, 'users')
    // 서버가 방문자를 웹 · 앱으로 나눠 보내면 표에 두 칸을 더한다.
    const split = result.hasVisitors && result.hasSources === true
    const cards: [string, number | null, number | null, (n: number | null) => string][] = [
      ['오늘', main.today, signed.today, people],
      ['어제', main.yesterday, signed.yesterday, people],
      ['최근 7일 평균', main.weekAverage, signed.weekAverage, average],
    ]
    body = (
      <>
        {!result.hasVisitors && (
          <p className="admin-daily__note">
            지금은 로그인한 사람만 셉니다. 서버에 <code>0013_daily_visitors.sql</code> 을 넣으면 로그인하지 않은 방문자도 셉니다.
          </p>
        )}
        <dl className="admin-daily__summary">
          {cards.map(([label, value, signedValue, format]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{format(value)}</dd>
              {result.hasVisitors && <dd className="admin-daily__sub">로그인 {format(signedValue)}</dd>}
            </div>
          ))}
        </dl>
        {/* 웹 · 앱으로 나누면 칸이 늘어난다. 좁은 화면에서는 표만 옆으로 밀어 본다. */}
        <div className="admin-scroll admin-scroll--daily" tabIndex={0} role="region" aria-label="날짜별 방문자 표">
          <table className="license-table admin-table admin-daily__table">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                {result.hasVisitors && <th scope="col">방문자</th>}
                {split && <th scope="col">웹</th>}
                {split && <th scope="col">앱</th>}
                <th scope="col">{result.hasVisitors ? '그중 로그인' : '로그인한 사람'}</th>
              </tr>
            </thead>
            <tbody>
              {result.days.map((row) => (
                <tr key={row.day}>
                  <th scope="row">{row.day === result.today ? `오늘 · ${dayLabel(row.day)}` : dayLabel(row.day)}</th>
                  {result.hasVisitors && <td>{people(row.visitors)}</td>}
                  {split && <td>{people(row.web ?? null)}</td>}
                  {split && <td>{people(row.app ?? null)}</td>}
                  <td>{people(row.users)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.visitorsSince && <p className="muted">방문자는 {dayLabel(result.visitorsSince)}부터 셉니다. '-'는 세기 전의 날입니다.</p>}
        {!result.visitorsSince && result.since && <p className="muted">{dayLabel(result.since)}부터 셉니다.</p>}
        {split && result.sourcesSince && <p className="muted">웹 · 앱 나눔은 {dayLabel(result.sourcesSince)}부터 셉니다. 그 앞의 날은 합계만 있습니다.</p>}
      </>
    )
  }
  return (
    <section className="admin-daily" aria-labelledby="admin-daily-title">
      <h2 id="admin-daily-title">하루 방문자</h2>
      <p className="muted">
        그날(한국 시간) 앱을 연 사람 수입니다. 로그인하지 않은 방문자도 세며, 같은 브라우저는 하루에 한 번만 셉니다. 누가 접속했는지는 남기지 않아서, 브라우저나 기기를 바꾸면 따로
        셉니다.
      </p>
      {body}
    </section>
  )
}

// 운영자용 사용량 화면 (A-6) · 신고 처리. 초안은 볼 수 없고, 신고된 것은 앞부분만 보여 준다.
export function AdminPage() {
  const account = useAccount()
  const [result, setResult] = useState<Usage | UsageError | null>(null)
  const [daily, setDaily] = useState<DailyActive | DailyActiveError | null>(null)
  const signedIn = account.status === 'in'

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void loadUsage().then((loaded) => {
      if (!cancelled) setResult(loaded)
    })
    void loadDailyActive().then((loaded) => {
      if (!cancelled) setDaily(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const refresh = () => {
    setResult(null)
    setDaily(null)
    void loadUsage().then(setResult)
    void loadDailyActive().then(setDaily)
  }

  return (
    <main className="licenses admin">
      <a href="#/">← 홈으로</a>
      <h1>운영 현황</h1>
      {account.status === 'off' ? (
        <p>서버가 설정되지 않았습니다.</p>
      ) : !signedIn ? (
        <p>{account.status === 'loading' ? '계정을 확인하는 중…' : '운영자 계정으로 로그인해 주세요.'}</p>
      ) : result === null ? (
        <p className="muted">불러오는 중…</p>
      ) : result === 'not-admin' ? (
        <p role="alert">운영자만 볼 수 있습니다.</p>
      ) : result === 'failed' ? (
        <p role="alert">사용량을 불러오지 못했습니다. 서버가 일시정지됐는지 Supabase 대시보드에서 확인해 주세요.</p>
      ) : (
        <>
          <p className="muted">무료 한도를 넘지 않도록, 기준에 닿은 항목은 자동으로 제한됩니다. 사용자의 초안은 이 화면에서 볼 수 없고, 신고된 글 · 댓글 · 소개는 처리하려고 앞부분만 보여 줍니다.</p>
          {/* 좁은 화면에서는 표만 옆으로 밀어 본다. 페이지가 넘치지 않게 한다. */}
          <div className="admin-scroll" tabIndex={0} role="region" aria-label="사용량 표">
            <table className="license-table admin-table">
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col">지금</th>
                  <th scope="col">제한 기준</th>
                  <th scope="col">무료 한도</th>
                  <th scope="col">상태</th>
                  <th scope="col">기준에 닿으면</th>
                </tr>
              </thead>
              <tbody>
                {usageRows(result).map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td>{row.current}</td>
                    <td>{row.threshold}</td>
                    <td>{row.limit}</td>
                    <td>
                      <span className="admin-level" data-level={row.level}>
                        {LEVEL_TEXT[row.level]}
                      </span>
                    </td>
                    <td>{row.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            서버 초안 {result.drafts.toLocaleString('ko-KR')}편 · 오늘 스탯 조회 {result.statCallsToday.toLocaleString('ko-KR')}회 · 캐시 {result.cacheRows.toLocaleString('ko-KR')}건
          </p>
          <p className="muted">전송량(월 5GB)은 여기서 잴 수 없습니다. Supabase 대시보드의 Usage 화면에서 확인해 주세요.</p>
          <DailyActiveSection result={daily} />
          <ReportsSection />
          <BannedWordsSection />
          <button type="button" className="btn" onClick={refresh}>
            새로 고침
          </button>
        </>
      )}
    </main>
  )
}
