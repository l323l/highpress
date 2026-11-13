import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCurrent, loadPast, loadPastMatch, loadPastMatches, StatsError } from './api'
import { StatsPane } from './StatsPane'
import type { StatSnapshot } from '@highpress/core/stats'

// 조회는 가짜로 바꾼다. 실제 응답 변환은 stats.test.ts, 실제 호출은 브라우저에서 확인한다.
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  loadCurrent: vi.fn(),
  loadPast: vi.fn(),
  loadPastMatches: vi.fn(),
  loadPastMatch: vi.fn(),
}))

const base = { source: 'football-data.org', fetchedAt: new Date(2026, 9, 9).getTime() }
const standings: StatSnapshot = { ...base, view: 'table', title: '프리미어리그 순위표', subtitle: '2026-27 시즌', columns: ['순위', '팀', '승점'], rows: [[1, 'Man City', 15]] }
const scorers: StatSnapshot = { ...base, view: 'bars', title: '프리미어리그 득점 순위', subtitle: '', columns: ['선수', '팀', '골'], rows: [['Erling Haaland', 'Man City', 5]] }
const versus: StatSnapshot = {
  ...base,
  source: 'API-Football',
  view: 'versus',
  title: 'A 1 - 0 B',
  subtitle: '',
  columns: ['항목', '홈', '원정'],
  rows: [
    ['슈팅', 14, 10],
    ['코너킥', 7, 8],
    ['파울', 12, 9],
  ],
  teams: ['A', 'B'],
}

const onInsert = vi.fn()
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const insertButton = () => screen.getByRole('button', { name: '본문에 넣기' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadCurrent).mockImplementation(async (kind) => (kind === 'scorers' ? scorers : standings))
  vi.mocked(loadPast).mockResolvedValue(standings)
  vi.mocked(loadPastMatches).mockResolvedValue([
    { id: 11, round: '1라운드', label: '08.16 A 1-0 B' },
    { id: 22, round: '2라운드', label: '08.24 C 2-2 D' },
  ])
  vi.mocked(loadPastMatch).mockResolvedValue(versus)
})

describe('스탯 넣기', () => {
  it('항목을 고르기 전에는 넣을 것이 없다', () => {
    render(<StatsPane onInsert={onInsert} />)
    expect(screen.getByText('스탯 항목을 고르면 도표가 여기에 나타납니다.')).toBeInTheDocument()
    expect(insertButton()).toBeDisabled()
  })

  it('항목을 고르면 도표가 나타나고, 본문에 넣을 수 있다 (S-1, S-5)', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('순위표')
    expect(await screen.findByText('프리미어리그 순위표')).toBeInTheDocument()
    expect(loadCurrent).toHaveBeenCalledWith('standings', 'PL', undefined)
    expect(screen.getByText('출처: football-data.org · 2026.10.09 기준')).toBeInTheDocument()

    fireEvent.click(insertButton())
    expect(onInsert).toHaveBeenCalledWith(standings)
    expect(screen.getByRole('status')).toHaveTextContent('본문에 넣었습니다.')
  })

  it('항목·리그·표시 범위를 바꿀 때마다 다시 조회한다', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('득점 순위')
    expect(await screen.findByText('Erling Haaland')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('표시 범위'), { target: { value: '5' } })
    await waitFor(() => expect(loadCurrent).toHaveBeenLastCalledWith('scorers', 'PL', 5))
    fireEvent.change(screen.getByLabelText('리그'), { target: { value: 'SA' } })
    await waitFor(() => expect(loadCurrent).toHaveBeenLastCalledWith('scorers', 'SA', 5))
  })

  it('지난 시즌은 시즌을 골라 조회한다', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('지난 시즌')
    expect(screen.queryByRole('button', { name: '최근 경기 결과' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('시즌'), { target: { value: '2022' } })
    press('순위표')
    await waitFor(() => expect(loadPast).toHaveBeenCalledWith('standings', 'PL', 2022, undefined))
  })

  it('경기 스탯 비교는 라운드와 경기를 고른 뒤 도표가 나온다', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('지난 시즌')
    press('경기 스탯 비교')
    const matchSelect = await screen.findByLabelText('경기')
    expect(within(matchSelect).getByRole('option', { name: '08.16 A 1-0 B' })).toBeInTheDocument()
    expect(within(matchSelect).queryByRole('option', { name: '08.24 C 2-2 D' })).not.toBeInTheDocument()
    expect(insertButton()).toBeDisabled()

    fireEvent.change(matchSelect, { target: { value: '11' } })
    expect(await screen.findByText('A 1 - 0 B')).toBeInTheDocument()
    expect(loadPastMatch).toHaveBeenCalledWith('PL', 11)
    // 경기 목록은 한 번만 가져온다.
    expect(loadPastMatches).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: '2라운드' } })
    expect(await within(screen.getByLabelText('경기')).findByRole('option', { name: '08.24 C 2-2 D' })).toBeInTheDocument()
    expect(insertButton()).toBeDisabled()
  })

  it('경기 스탯 비교는 원하는 항목만 골라 넣을 수 있다', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('지난 시즌')
    press('경기 스탯 비교')
    fireEvent.change(await screen.findByLabelText('경기'), { target: { value: '11' } })
    const picker = await screen.findByRole('group', { name: '넣을 항목' })
    expect(within(picker).getAllByRole('checkbox')).toHaveLength(3)

    // 하나를 빼면 미리보기와 본문에 넣는 내용에서 함께 빠진다.
    fireEvent.click(within(picker).getByLabelText('코너킥'))
    const preview = document.querySelector('.stats-preview') as HTMLElement
    expect(within(preview).queryByText('코너킥')).not.toBeInTheDocument()
    fireEvent.click(insertButton())
    expect(onInsert.mock.calls[0][0].rows).toEqual([
      ['슈팅', 14, 10],
      ['파울', 12, 9],
    ])

    // 하나만 골라 따로 넣을 수도 있다.
    press('전체 해제')
    expect(insertButton()).toBeDisabled()
    expect(within(preview).getByText('넣을 항목을 하나 이상 고르세요.')).toBeInTheDocument()
    fireEvent.click(within(picker).getByLabelText('파울'))
    fireEvent.click(insertButton())
    expect(onInsert.mock.calls[1][0].rows).toEqual([['파울', 12, 9]])

    press('전체 선택')
    fireEvent.click(insertButton())
    expect(onInsert.mock.calls[2][0].rows).toHaveLength(3)
  })

  it('표와 막대 도표에는 항목 고르기가 없다', async () => {
    render(<StatsPane onInsert={onInsert} />)
    press('순위표')
    await screen.findByText('프리미어리그 순위표')
    expect(screen.queryByRole('group', { name: '넣을 항목' })).not.toBeInTheDocument()
  })

  it('조회하지 못하면 이유를 알리고 넣기를 막는다', async () => {
    vi.mocked(loadCurrent).mockRejectedValue(new StatsError('unavailable'))
    render(<StatsPane onInsert={onInsert} />)
    press('순위표')
    expect(await screen.findByRole('alert')).toHaveTextContent('스탯 서버에 연결할 수 없습니다')
    expect(insertButton()).toBeDisabled()
  })

  it('늦게 온 응답이 나중에 고른 것을 덮어쓰지 않는다', async () => {
    let finishSlow: (value: StatSnapshot) => void = () => undefined
    vi.mocked(loadCurrent).mockImplementation((kind) => (kind === 'standings' ? new Promise((resolve) => (finishSlow = resolve)) : Promise.resolve(scorers)))
    render(<StatsPane onInsert={onInsert} />)
    press('순위표')
    press('득점 순위')
    expect(await screen.findByText('프리미어리그 득점 순위')).toBeInTheDocument()
    finishSlow(standings)
    await waitFor(() => expect(screen.queryByText('프리미어리그 순위표')).not.toBeInTheDocument())
  })
})

describe('추천 사이트', () => {
  it('사이트마다 새 창 링크가 있고, 찾는 스탯으로 추릴 수 있다', () => {
    render(<StatsPane />)
    fireEvent.click(screen.getByRole('tab', { name: '추천 사이트' }))
    expect(screen.getByRole('heading', { name: 'Opta Analyst' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'WhoScored' })).toBeInTheDocument()
    const link = screen.getAllByRole('link')[0]
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    fireEvent.click(screen.getByRole('button', { name: 'xG · 기대 득점' }))
    expect(screen.getByRole('heading', { name: 'Understat' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Transfermarkt' })).not.toBeInTheDocument()
  })
})
