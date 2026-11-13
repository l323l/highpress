import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from './AdminPage'
import { useAccount, type Account } from './session'
import { dailySummary, levelOf, loadDailyActive, loadUsage, usageRows, type DailyActive, type Usage } from './usage'

// 서버 호출은 가짜로 바꾼다. 실제 값은 Supabase에 0002_ops.sql을 넣은 뒤 브라우저에서 확인한다.
vi.mock('./session', async (original) => ({ ...(await original<typeof import('./session')>()), useAccount: vi.fn() }))
vi.mock('./usage', async (original) => ({ ...(await original<typeof import('./usage')>()), loadUsage: vi.fn(), loadDailyActive: vi.fn() }))

const MB = 1024 * 1024
const usage = (patch: Partial<Usage> = {}): Usage => ({
  users: 3,
  maxUsers: 50,
  drafts: 4,
  dbBytes: 12 * MB,
  dbLimitBytes: 400 * MB,
  edgeCallsMonth: 1200,
  edgeMonthLimit: 400_000,
  pastApiToday: 7,
  statCallsToday: 21,
  cacheRows: 15,
  ...patch,
})

const signedIn: Account = { status: 'in', userId: 'u1', email: 'op@example.com', accessToken: 't', profile: { nickname: '운영자' }, serverDown: false }

// 오늘부터 거슬러 올라간다 (서버가 주는 순서). 방문자는 15일부터 셌다.
const daily = (patch: Partial<DailyActive> = {}): DailyActive => ({
  today: '2026-10-16',
  since: '2026-10-14',
  visitorsSince: '2026-10-15',
  hasVisitors: true,
  days: [
    { day: '2026-10-16', users: 4, visitors: 31 },
    { day: '2026-10-15', users: 7, visitors: 52 },
    { day: '2026-10-14', users: 2, visitors: null },
  ],
  ...patch,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(signedIn)
  vi.mocked(loadUsage).mockResolvedValue(usage())
  vi.mocked(loadDailyActive).mockResolvedValue(daily())
})

describe('하루 방문자 계산', () => {
  it('오늘 · 어제 · 센 날들의 7일 평균 (방문자)', () => {
    expect(dailySummary(daily())).toEqual({ today: 31, yesterday: 52, weekAverage: 41.5 })
  })

  it('그중 로그인한 사람도 같은 방식으로 센다', () => {
    expect(dailySummary(daily(), 'users')).toEqual({ today: 4, yesterday: 7, weekAverage: 13 / 3 })
  })

  it('오늘 처음 센 날이면 어제는 없다', () => {
    expect(dailySummary(daily({ visitorsSince: '2026-10-16', days: [{ day: '2026-10-16', users: 1, visitors: 3 }] }))).toEqual({ today: 3, yesterday: null, weekAverage: 3 })
  })

  it('7일보다 오래 센 경우 최근 7일만 평균 낸다', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ day: `2026-10-${String(16 - i).padStart(2, '0')}`, users: 1, visitors: i < 7 ? 2 : 100 }))
    expect(dailySummary(daily({ visitorsSince: '2026-10-07', days })).weekAverage).toBe(2)
  })
})

describe('방문자 수 불러오기', () => {
  it('세기 전의 날은 null 로, 둘 다 세기 전인 날은 뺀다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        today: '2026-10-16',
        since: '2026-10-15',
        visitors_since: '2026-10-16',
        days: [
          { day: '2026-10-16', users: 2, visitors: 9 },
          { day: '2026-10-15', users: 3, visitors: 0 },
          { day: '2026-10-14', users: 0, visitors: 0 },
        ],
      },
      error: null,
    })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockReturnValue(Promise.resolve({ rpc } as never))
    const { loadDailyActive: realLoad } = await vi.importActual<typeof import('./usage')>('./usage')
    expect(await realLoad()).toEqual({
      today: '2026-10-16',
      since: '2026-10-15',
      visitorsSince: '2026-10-16',
      hasVisitors: true,
      days: [
        { day: '2026-10-16', users: 2, visitors: 9 },
        { day: '2026-10-15', users: 3, visitors: null },
      ],
    })
    spy.mockRestore()
  })
})

describe('하루 방문자 화면', () => {
  it('요약과 날짜별 방문자 · 그중 로그인을 보여 준다', async () => {
    render(<AdminPage />)
    const section = await screen.findByRole('region', { name: '하루 방문자' })
    const today = within(section).getByText('오늘').parentElement as HTMLElement
    expect(today).toHaveTextContent('31명')
    expect(today).toHaveTextContent('로그인 4명')
    expect(within(section).getByText('최근 7일 평균').parentElement).toHaveTextContent('41.5명')
    expect(within(section).getByRole('rowheader', { name: '오늘 · 10월 16일 (금)' })).toBeInTheDocument()
    const row = within(section).getByRole('rowheader', { name: '10월 14일 (수)' }).parentElement as HTMLElement
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['-', '2명'])
    expect(within(section).getByText(/방문자는 10월 15일 \(목\)부터 셉니다/)).toBeInTheDocument()
  })

  it('0013 을 넣기 전이면 로그인한 사람 수를 보여 주고 넣을 파일을 알려 준다', async () => {
    vi.mocked(loadDailyActive).mockResolvedValue(
      daily({
        visitorsSince: null,
        hasVisitors: false,
        days: [
          { day: '2026-10-16', users: 4, visitors: null },
          { day: '2026-10-15', users: 7, visitors: null },
        ],
      }),
    )
    render(<AdminPage />)
    expect(await screen.findByText('0013_daily_visitors.sql')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: '하루 방문자' })
    expect(within(section).getByText('오늘').parentElement).toHaveTextContent('4명')
    expect(within(section).queryByText(/^로그인 \d/)).not.toBeInTheDocument()
    expect(within(section).queryByRole('columnheader', { name: '방문자' })).not.toBeInTheDocument()
  })

  it('서버에 함수를 넣기 전이면 넣을 파일을 알려 준다', async () => {
    vi.mocked(loadDailyActive).mockResolvedValue('missing')
    render(<AdminPage />)
    expect(await screen.findByText('0012_daily_active.sql')).toBeInTheDocument()
    // 나머지 사용량 표는 그대로 보인다.
    expect(screen.getByRole('rowheader', { name: 'DB 용량' })).toBeInTheDocument()
  })

  it('아직 센 날이 없으면 그렇게 적는다', async () => {
    vi.mocked(loadDailyActive).mockResolvedValue(daily({ since: null, visitorsSince: null, days: [] }))
    render(<AdminPage />)
    expect(await screen.findByText(/아직 센 날이 없습니다/)).toBeInTheDocument()
  })

  it('새로 고침하면 방문자 수도 다시 불러온다', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: '새로 고침' }))
    await waitFor(() => expect(loadDailyActive).toHaveBeenCalledTimes(2))
  })
})

describe('사용량 계산', () => {
  it('기준의 80%부터 임박, 기준에 닿으면 제한 중', () => {
    expect(levelOf(79, 100)).toBe('ok')
    expect(levelOf(80, 100)).toBe('near')
    expect(levelOf(100, 100)).toBe('limited')
    expect(levelOf(5, 0)).toBe('ok')
  })

  it('항목마다 지금 값·제한 기준·무료 한도를 적는다', () => {
    const rows = usageRows(usage())
    expect(rows.map((row) => row.name)).toEqual(['가입자', 'DB 용량', '서버 함수 호출 (이번 달)', 'API-Football 호출 (오늘)'])
    expect(rows[1]).toMatchObject({ current: '12.0MB', threshold: '400.0MB', limit: '500.0MB', level: 'ok' })
    expect(rows[2]).toMatchObject({ current: '1,200회', threshold: '400,000회', limit: '500,000회' })
    expect(rows[3]).toMatchObject({ threshold: '90회', limit: '100회' })
  })

  it('한도에 가까워지거나 닿은 항목을 가려낸다', () => {
    const rows = usageRows(usage({ users: 50, dbBytes: 330 * MB, pastApiToday: 90 }))
    expect(rows.map((row) => row.level)).toEqual(['limited', 'near', 'ok', 'limited'])
  })
})

describe('운영 현황 화면 (A-6)', () => {
  it('운영자에게 사용량 표를 보여 준다', async () => {
    render(<AdminPage />)
    expect(await screen.findByRole('rowheader', { name: 'DB 용량' })).toBeInTheDocument()
    expect(screen.getByText('12.0MB')).toBeInTheDocument()
    expect(screen.getAllByText('여유')).toHaveLength(4)
    expect(screen.getByText(/서버 초안 4편 · 오늘 스탯 조회 21회 · 캐시 15건/)).toBeInTheDocument()
  })

  it('제한 중인 항목은 글자로 표시한다', async () => {
    vi.mocked(loadUsage).mockResolvedValue(usage({ users: 50 }))
    render(<AdminPage />)
    expect(await screen.findByText('제한 중')).toBeInTheDocument()
    expect(screen.getByText('신규 가입 중단')).toBeInTheDocument()
  })

  it('운영자가 아니면 내용을 보여 주지 않는다', async () => {
    vi.mocked(loadUsage).mockResolvedValue('not-admin')
    render(<AdminPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('운영자만 볼 수 있습니다.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('로그인하지 않았으면 서버에 묻지 않는다', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    render(<AdminPage />)
    expect(screen.getByText('운영자 계정으로 로그인해 주세요.')).toBeInTheDocument()
    expect(loadUsage).not.toHaveBeenCalled()
  })

  it('불러오지 못하면 일시정지 여부를 확인하도록 안내하고, 새로 고칠 수 있다', async () => {
    vi.mocked(loadUsage).mockResolvedValueOnce('failed')
    render(<AdminPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('일시정지')

    vi.mocked(loadUsage).mockResolvedValue(usage({ users: 9 }))
    render(<AdminPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: '새로 고침' }))[0])
    await waitFor(() => expect(loadUsage).toHaveBeenCalledTimes(3))
  })
})
