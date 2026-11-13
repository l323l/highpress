import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { createColumn, saveTeam, updateColumn } from '../../db/store'
import packageJson from '../../../package.json'
import { LicensesPage } from '../legal'
import { HomePage } from '.'

// 서버 설정이 없는 상태(기기 저장만 쓰는 상태)로 고정한다. 피드 탭은 feed.test.tsx에서 확인한다.
vi.mock('../account/session', async (original) => ({
  ...(await original<typeof import('../account/session')>()),
  useAccount: () => ({ status: 'off' }),
}))

beforeEach(() => {
  window.location.hash = ''
})

describe('HomePage', () => {
  it('칼럼이 없으면 안내 문구를 보여준다', async () => {
    render(<HomePage />)
    expect(await screen.findByText('아직 쓴 칼럼이 없어요')).toBeInTheDocument()
  })

  it('글쓰기 버튼은 칼럼을 만들고 편집기로 이동한다', async () => {
    render(<HomePage />)
    await userEvent.click(await screen.findByRole('button', { name: '글쓰기' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/write\/[\w-]+$/))
    expect(await db.columns.count()).toBe(1)
  })

  it('카드에 제목 대체 문구, 팀, 상태를 보여주고 안전한 링크만 렌더링한다', async () => {
    const team = await saveTeam({ name: '토트넘', color: '#112233' })
    const a = await createColumn()
    await updateColumn(a.id, { teamId: team.id, status: 'published', publishedUrl: 'https://cafe.example/1' })
    const b = await createColumn()
    await updateColumn(b.id, { title: '위험', publishedUrl: 'javascript:alert(1)' })
    render(<HomePage />)

    expect(await screen.findByText('제목 없음')).toBeInTheDocument()
    expect(screen.getByText('게시됨')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: '게시된 글 보기' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://cafe.example/1')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  it('베스트 지정 칼럼은 상단 카드로 보이고 팀 필터가 적용된다', async () => {
    const team = await saveTeam({ name: '아스날', color: '#aa0000' })
    const a = await createColumn()
    await updateColumn(a.id, { title: '베스트글', teamId: team.id })
    await createColumn()
    render(<HomePage />)

    const card = (await screen.findByText('베스트글')).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: '베스트로 지정' }))
    expect(await screen.findByText('베스트 칼럼')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '아스날' }))
    expect(screen.getByText('베스트글')).toBeInTheDocument()
    expect(screen.queryByText('제목 없음')).not.toBeInTheDocument()
  })

  it('삭제는 확인 후에만 실행된다', async () => {
    const c = await createColumn()
    await updateColumn(c.id, { title: '지울 글' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<HomePage />)
    const card = (await screen.findByText('지울 글')).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: '삭제' }))
    expect(await db.columns.count()).toBe(1)
    await userEvent.click(within(card).getByRole('button', { name: '삭제' }))
    await waitFor(async () => expect(await db.columns.count()).toBe(0))
    confirm.mockRestore()
  })

  it('이름은 영어로 보이고, 메뉴를 누르면 설정창이 열리고 Esc 로 닫힌다', async () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'HIGH PRESS' })).toBeInTheDocument()
    // 예전의 관리 탭은 없다.
    expect(screen.queryByRole('tab', { name: '관리' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '메뉴' }))
    const dialog = screen.getByRole('dialog', { name: '설정' })
    expect(within(dialog).getByRole('button', { name: '백업 내보내기' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '#/terms')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
  })

  it('이름이나 로고를 누르면 처음 상태로 돌아가 맨 위로 올라간다', async () => {
    const team = await saveTeam({ name: '새로고침팀', color: '#112233' })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<HomePage />)
    const filters = within(await screen.findByRole('group', { name: '팀 필터' }))
    await userEvent.click(await filters.findByRole('button', { name: team.name }))
    expect(filters.getByRole('button', { name: team.name })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'HIGH PRESS' }))
    expect(filters.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    scrollTo.mockRestore()
  })

  it('설정창에서 화면 밝기를 바꾼다. 처음에는 어두운 화면이다', async () => {
    render(<HomePage />)
    await userEvent.click(screen.getByRole('button', { name: '메뉴' }))
    expect(await screen.findByRole('button', { name: '어둡게' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '밝게' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '밝게' })).toHaveAttribute('aria-pressed', 'true'))
    expect((await db.settings.get('theme'))?.value).toBe('light')
  })

  it('팀을 추가할 수 있다', async () => {
    render(<HomePage />)
    await userEvent.type(await screen.findByLabelText('새 팀 이름'), '첼시')
    await userEvent.click(screen.getByRole('button', { name: '팀 추가' }))
    expect(await screen.findByRole('button', { name: '첼시' })).toBeInTheDocument()
    expect((await db.teams.toArray())[0].name).toBe('첼시')
  })

  it('잘못된 백업 파일은 한국어 오류를 보여준다', async () => {
    render(<HomePage />)
    await userEvent.click(await screen.findByRole('button', { name: '메뉴' }))
    const input = await screen.findByLabelText('백업 파일 선택')
    await userEvent.upload(input, new File(['nope'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('status')).toHaveTextContent('JSON 형식이 아닙니다')
  })
})

describe('백업 가져오기 덮어쓰기 확인', () => {
  const backupFile = () =>
    new File(
      [
        JSON.stringify({
          app: 'football-column-app',
          schemaVersion: 1,
          exportedAt: 1,
          columns: [{ id: 'same', title: '백업 제목', body: { type: 'doc', content: [] }, createdAt: 1, updatedAt: 2 }],
          teams: [],
          tacticProjects: [],
          media: [],
        }),
      ],
      'b.json',
      { type: 'application/json' },
    )

  it('취소하면 기존 칼럼을 덮어쓰지 않는다', async () => {
    await db.columns.add({ ...(await createColumn()), id: 'same', title: '기기 제목' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<HomePage />)
    await userEvent.click(await screen.findByRole('button', { name: '메뉴' }))
    await userEvent.upload(await screen.findByLabelText('백업 파일 선택'), backupFile())
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('덮어써집니다'))
    expect((await db.columns.get('same'))!.title).toBe('기기 제목')
    confirm.mockRestore()
  })

  it('확인하면 백업 내용으로 덮어쓴다', async () => {
    await db.columns.add({ ...(await createColumn()), id: 'same', title: '기기 제목' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HomePage />)
    await userEvent.click(await screen.findByRole('button', { name: '메뉴' }))
    await userEvent.upload(await screen.findByLabelText('백업 파일 선택'), backupFile())
    await waitFor(async () => expect((await db.columns.get('same'))!.title).toBe('백업 제목'))
    confirm.mockRestore()
  })
})

describe('LicensesPage', () => {
  it('모든 런타임 의존성과 홈 링크를 보여준다', () => {
    render(<LicensesPage />)
    expect(screen.getByRole('link', { name: /홈으로/ })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('rowheader', { name: 'mediabunny' })).toBeInTheDocument()
    // 머리글 한 줄 + package.json의 dependencies 전부
    expect(screen.getAllByRole('row')).toHaveLength(Object.keys(packageJson.dependencies).length + 1)
  })
})
