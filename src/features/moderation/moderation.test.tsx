import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from '../account/AdminPage'
import { openLogin } from '../account/loginPrompt'
import { useAccount, type Account } from '../account/session'
import { loadDailyActive, loadUsage, type DailyActive, type Usage } from '../account/usage'
import { FeedPane } from '../feed/FeedPane'
import { getFeedRemote } from '../feed/remote'
import type { FeedComment, FeedPost, FeedProfile, FeedRemote } from '@highpress/core/feed'
import { SettingsDrawer } from '../home/SettingsDrawer'
import { PostPage } from '../post/PostPage'
import { ProfilePage } from '../profile/ProfilePage'
import { getModerationRemote, HIDDEN_NOTICE, MODERATION_ERROR_TEXT, ModerationError, type ModerationRemote, type ReportGroup } from './api'
import { BlockDialog } from './ConfirmDialog'
import { ModerationMenu } from './ModerationMenu'
import { ReportSheet } from './ReportSheet'

// 서버 호출은 가짜로 바꾼다. 실제 동작은 Supabase에 0014_moderation.sql을 넣은 뒤 브라우저에서 확인한다.
vi.mock('../account/session', async (original) => ({ ...(await original<typeof import('../account/session')>()), useAccount: vi.fn() }))
vi.mock('../account/loginPrompt', async (original) => ({ ...(await original<typeof import('../account/loginPrompt')>()), openLogin: vi.fn() }))
vi.mock('../account/usage', async (original) => ({ ...(await original<typeof import('../account/usage')>()), loadUsage: vi.fn(), loadDailyActive: vi.fn() }))
vi.mock('../feed/remote', async (original) => ({ ...(await original<typeof import('../feed/remote')>()), getFeedRemote: vi.fn() }))
vi.mock('../feed/PostBody', () => ({ default: () => <div data-testid="post-body" /> }))
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), getModerationRemote: vi.fn() }))

const member: Account = { status: 'in', userId: 'me', email: 'me@example.com', accessToken: 't', profile: { nickname: '나의 이름' }, serverDown: false }
// 로그인은 했지만 약관 동의(가입)를 마치지 않은 사람
const halfway: Account = { status: 'in', userId: 'me', email: 'me@example.com', accessToken: 't', profile: null, serverDown: false }
const guest: Account = { status: 'out', serverDown: false } as Account

const post = (patch: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p1',
  userId: 'other',
  nickname: '빌드업',
  columnId: 'c1',
  title: '하프스페이스를 여는 법',
  excerpt: '풀백이 안으로 들어오면 생기는 일',
  createdAt: Date.now() - 5 * 60_000,
  likeCount: 2,
  commentCount: 2,
  liked: false,
  club: null,
  cover: null,
  avatar: null,
  ...patch,
})

const comment = (patch: Partial<FeedComment> = {}): FeedComment => ({ id: 'k0', userId: 'other', nickname: '빌드업', body: '남의 댓글', createdAt: Date.now(), parentId: null, likeCount: 0, liked: false, deleted: false, avatar: null, ...patch })

const profile = (patch: Partial<FeedProfile> = {}): FeedProfile => ({
  userId: 'other',
  nickname: '빌드업',
  bio: '전환 국면을 주로 씁니다',
  club: null,
  lastSeenAt: null,
  postCount: 1,
  followerCount: 2,
  followingCount: 3,
  likeCount: 4,
  following: false,
  fresh: false,
  avatar: null,
  ...patch,
})

function useFeed(patch: Partial<FeedRemote> = {}): FeedRemote {
  const remote = {
    page: vi.fn().mockResolvedValue([post()]),
    post: vi.fn().mockResolvedValue(post()),
    popular: vi.fn().mockResolvedValue([]),
    searchPeople: vi.fn().mockResolvedValue([]),
    profile: vi.fn().mockResolvedValue(profile()),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    cover: vi.fn().mockResolvedValue(null),
    like: vi.fn().mockResolvedValue(undefined),
    unlike: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    comments: vi.fn().mockResolvedValue([comment({ id: 'k1', userId: 'me', nickname: '나의 이름', body: '내 댓글' }), comment({ id: 'k2' })]),
    addComment: vi.fn().mockResolvedValue(undefined),
    removeComment: vi.fn().mockResolvedValue(true),
    likeComment: vi.fn().mockResolvedValue(undefined),
    unlikeComment: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    ...patch,
  } as unknown as FeedRemote
  vi.mocked(getFeedRemote).mockResolvedValue(remote)
  return remote
}

function useModeration(patch: Partial<ModerationRemote> = {}): ModerationRemote {
  const remote: ModerationRemote = {
    report: vi.fn().mockResolvedValue(undefined),
    block: vi.fn().mockResolvedValue(undefined),
    unblock: vi.fn().mockResolvedValue(undefined),
    blocks: vi.fn().mockResolvedValue([]),
    reports: vi.fn().mockResolvedValue([]),
    resolve: vi.fn().mockResolvedValue(undefined),
    unsuspend: vi.fn().mockResolvedValue(undefined),
    bannedWords: vi.fn().mockResolvedValue([]),
    addBannedWord: vi.fn().mockResolvedValue(undefined),
    removeBannedWord: vi.fn().mockResolvedValue(undefined),
    ...patch,
  }
  vi.mocked(getModerationRemote).mockResolvedValue(remote)
  return remote
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(member)
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  useModeration()
})

describe('신고 창', () => {
  const target = { kind: 'post' as const, targetId: 'p1', part: 'cover' as const, label: '대표 사진', preview: '하프스페이스를 여는 법' }

  it('사유를 골라야 보낼 수 있고, 사유 · 자세한 내용 · 사진 구분을 함께 보낸다', async () => {
    const remote = useModeration()
    render(<ReportSheet target={target} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '대표 사진 신고하기' })
    const send = within(dialog).getByRole('button', { name: '신고하기' })
    expect(send).toBeDisabled()
    // 처음 초점은 첫 사유에 있다.
    expect(within(dialog).getByRole('radio', { name: '광고 · 도배' })).toHaveFocus()

    fireEvent.click(within(dialog).getByRole('radio', { name: '욕설 · 괴롭힘' }))
    fireEvent.change(within(dialog).getByLabelText(/자세한 내용/), { target: { value: '사진에 욕설이 적혀 있습니다' } })
    fireEvent.click(send)

    expect(await within(dialog).findByText('신고했습니다. 운영자가 확인합니다.')).toBeInTheDocument()
    expect(remote.report).toHaveBeenCalledWith({ kind: 'post', targetId: 'p1', reason: 'abuse', detail: '사진에 욕설이 적혀 있습니다', part: 'cover' })
    // 아래의 "닫기" 단추로 초점이 옮겨 간다 (위의 X 단추도 이름이 같다).
    expect(within(dialog).getAllByRole('button', { name: '닫기' })[1]).toHaveFocus()
  })

  it('자세한 내용은 300자까지 적는다', () => {
    render(<ReportSheet target={target} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/자세한 내용/)).toHaveAttribute('maxLength', '300')
    expect(screen.getByText('0/300자')).toBeInTheDocument()
  })

  it('서버가 거절하면 그 까닭을 보여 주고 창을 닫지 않는다', async () => {
    useModeration({ report: vi.fn().mockRejectedValue(new ModerationError('already')) })
    render(<ReportSheet target={target} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: '광고 · 도배' }))
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MODERATION_ERROR_TEXT.already)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Esc 로 닫는다', () => {
    const onClose = vi.fn()
    render(<ReportSheet target={target} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('차단 확인', () => {
  it('정한 문구로 묻고, 차단한 뒤 부른 쪽에 알린다', async () => {
    const remote = useModeration()
    const onBlocked = vi.fn()
    const onClose = vi.fn()
    render(<BlockDialog userId="other" name="빌드업" onBlocked={onBlocked} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: '빌드업님을 차단할까요?' })
    expect(dialog).toHaveTextContent('이 사람의 글과 댓글이 보이지 않고, 이 사람은 내 글에 댓글을 달거나 나를 팔로우할 수 없습니다.')
    // 처음 초점은 취소에 있다 (Enter 로 바로 차단되지 않게).
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: '차단하기' }))
    await waitFor(() => expect(onBlocked).toHaveBeenCalledWith('other'))
    expect(remote.block).toHaveBeenCalledWith('other')
    expect(onClose).toHaveBeenCalled()
  })

  it('한도에 닿으면 알려 주고 그대로 둔다', async () => {
    useModeration({ block: vi.fn().mockRejectedValue(new ModerationError('quota')) })
    const onBlocked = vi.fn()
    render(<BlockDialog userId="other" name="빌드업" onBlocked={onBlocked} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '차단하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MODERATION_ERROR_TEXT.quota)
    expect(onBlocked).not.toHaveBeenCalled()
  })
})

describe('⋯ 메뉴', () => {
  const reports = [{ kind: 'user' as const, targetId: 'other', label: '사용자', preview: '빌드업' }]

  it('로그인하지 않았으면 로그인 창을 연다', () => {
    vi.mocked(useAccount).mockReturnValue(guest)
    render(<ModerationMenu me="" label="프로필 메뉴" reports={reports} person={{ userId: 'other', name: '빌드업' }} />)
    fireEvent.click(screen.getByRole('button', { name: '프로필 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '신고하기' }))
    expect(openLogin).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('가입을 마치지 않았으면 가입 안내를 띄운다', () => {
    vi.mocked(useAccount).mockReturnValue(halfway)
    render(<ModerationMenu me="" label="프로필 메뉴" reports={reports} person={{ userId: 'other', name: '빌드업' }} />)
    fireEvent.click(screen.getByRole('button', { name: '프로필 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '차단하기' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('차단은 가입을 마친 뒤에 할 수 있습니다')
    expect(openLogin).not.toHaveBeenCalled()
  })

  it('계정을 확인하는 동안에는 열리지 않는다', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'loading' } as Account)
    render(<ModerationMenu me="" label="프로필 메뉴" reports={reports} person={{ userId: 'other', name: '빌드업' }} />)
    expect(screen.getByRole('button', { name: '프로필 메뉴' })).toBeDisabled()
  })

  it('화살표로 메뉴 줄을 옮기고 Esc 로 닫으면 단추로 돌아간다', () => {
    render(<ModerationMenu me="me" label="프로필 메뉴" reports={reports} person={{ userId: 'other', name: '빌드업' }} />)
    const trigger = screen.getByRole('button', { name: '프로필 메뉴' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1], { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('피드의 글 카드', () => {
  it('남의 글에만 ⋯ 메뉴가 있고, 대표 사진이 있으면 사진 신고가 따로 있다', async () => {
    useFeed({ page: vi.fn().mockResolvedValue([post({ cover: 'other/p1.webp' }), post({ id: 'p2', userId: 'me', nickname: '나의 이름', title: '내 글' })]) })
    render(<FeedPane />)
    const menu = await screen.findByRole('button', { name: '빌드업 님의 글 메뉴' })
    expect(screen.queryByRole('button', { name: '나의 이름 님의 글 메뉴' })).not.toBeInTheDocument()
    fireEvent.click(menu)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['신고하기', '대표 사진 신고하기', '차단하기'])
    fireEvent.click(screen.getByRole('menuitem', { name: '대표 사진 신고하기' }))
    expect(screen.getByRole('dialog', { name: '대표 사진 신고하기' })).toHaveTextContent('하프스페이스를 여는 법')
  })

  it('가입을 마치지 않았어도 내 계정의 글에는 메뉴가 없다 (계정 id 로 본다)', async () => {
    vi.mocked(useAccount).mockReturnValue(halfway)
    useFeed({ page: vi.fn().mockResolvedValue([post({ userId: 'me', nickname: '나의 이름', title: '내 글' }), post({ id: 'p2' })]) })
    render(<FeedPane />)
    expect(await screen.findByRole('button', { name: '빌드업 님의 글 메뉴' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '나의 이름 님의 글 메뉴' })).not.toBeInTheDocument()
  })

  it('차단하면 피드를 새로 읽는다', async () => {
    const feed = useFeed()
    const remote = useModeration()
    render(<FeedPane />)
    fireEvent.click(await screen.findByRole('button', { name: '빌드업 님의 글 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '차단하기' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '차단하기' }))
    await waitFor(() => expect(remote.block).toHaveBeenCalledWith('other'))
    await waitFor(() => expect(feed.page).toHaveBeenCalledTimes(2))
  })

  it('숨겨진 내 글에는 안내 줄과 문의 단추가 붙는다', async () => {
    useFeed({ page: vi.fn().mockResolvedValue([post({ userId: 'me', nickname: '나의 이름', hidden: true })]) })
    render(<FeedPane />)
    expect(await screen.findByText(HIDDEN_NOTICE, { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '피드백으로 문의하기' }))
    expect(screen.getByRole('dialog', { name: '숨겨진 글에 대해 문의하기' })).toBeInTheDocument()
  })
})

describe('글 화면', () => {
  it('남의 글에는 신고 · 차단 메뉴, 내 글에는 내 글 메뉴만 있다', async () => {
    useFeed()
    const { unmount } = render(<PostPage author="other" postId="p1" />)
    expect(await screen.findByRole('button', { name: '이 글 메뉴' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '내 글 메뉴' })).not.toBeInTheDocument()
    unmount()

    useFeed({ post: vi.fn().mockResolvedValue(post({ userId: 'me', nickname: '나의 이름', hidden: true })) })
    render(<PostPage author="me" postId="p1" />)
    expect(await screen.findByRole('button', { name: '내 글 메뉴' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 글 메뉴' })).not.toBeInTheDocument()
    expect(screen.getAllByText(HIDDEN_NOTICE, { exact: false }).length).toBeGreaterThan(0)
  })

  it('글쓴이를 차단하면 글을 거두고 차단했다고 알린다', async () => {
    useFeed()
    render(<PostPage author="other" postId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: '이 글 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '차단하기' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '차단하기' }))
    expect(await screen.findByRole('heading', { name: '빌드업님을 차단했습니다' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '하프스페이스를 여는 법' })).not.toBeInTheDocument()
  })

  it('남의 댓글에만 메뉴가 있고, 댓글 신고는 댓글로 보낸다', async () => {
    useFeed()
    const remote = useModeration()
    render(<PostPage author="other" postId="p1" />)
    const menu = await screen.findByRole('button', { name: '빌드업 님의 댓글 메뉴' })
    expect(screen.queryByRole('button', { name: '나의 이름 님의 댓글 메뉴' })).not.toBeInTheDocument()
    fireEvent.click(menu)
    fireEvent.click(screen.getByRole('menuitem', { name: '신고하기' }))
    const dialog = screen.getByRole('dialog', { name: '댓글 신고하기' })
    fireEvent.click(within(dialog).getByRole('radio', { name: '혐오 · 차별' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '신고하기' }))
    await waitFor(() => expect(remote.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'comment', targetId: 'k2', reason: 'hate' })))
  })

  it('숨겨진 내 댓글에는 안내가 붙는다', async () => {
    useFeed({ comments: vi.fn().mockResolvedValue([comment({ id: 'k1', userId: 'me', nickname: '나의 이름', body: '내 댓글', hidden: true })]) })
    render(<PostPage author="other" postId="p1" />)
    expect(await screen.findByText(HIDDEN_NOTICE, { exact: false })).toBeInTheDocument()
  })
})

describe('프로필', () => {
  it('남의 프로필에서 사용자와 프로필 사진을 따로 신고한다', async () => {
    useFeed({ profile: vi.fn().mockResolvedValue(profile({ avatar: 'other/a.webp' })) })
    const remote = useModeration()
    render(<ProfilePage userId="other" />)
    fireEvent.click(await screen.findByRole('button', { name: '프로필 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '프로필 사진 신고하기' }))
    const dialog = screen.getByRole('dialog', { name: '프로필 사진 신고하기' })
    fireEvent.click(within(dialog).getByRole('radio', { name: '음란물 · 성적인 내용' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '신고하기' }))
    await waitFor(() => expect(remote.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'user', targetId: 'other', part: 'avatar', reason: 'sexual' })))
  })

  it('내 프로필에는 메뉴가 없다', async () => {
    useFeed({ profile: vi.fn().mockResolvedValue(profile({ userId: 'me', nickname: '나의 이름' })) })
    render(<ProfilePage userId="me" />)
    expect(await screen.findByRole('button', { name: '프로필 고치기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '프로필 메뉴' })).not.toBeInTheDocument()
  })

  it('차단하면 프로필과 글을 거둔다', async () => {
    useFeed()
    render(<ProfilePage userId="other" />)
    fireEvent.click(await screen.findByRole('button', { name: '프로필 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '차단하기' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '차단하기' }))
    expect(await screen.findByRole('heading', { name: '빌드업님을 차단했습니다' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '팔로우' })).not.toBeInTheDocument()
  })
})

describe('설정의 차단한 사람', () => {
  it('목록을 보여 주고 차단을 풀면 목록에서 뺀다', async () => {
    const remote = useModeration({ blocks: vi.fn().mockResolvedValue([{ userId: 'other', nickname: '빌드업', avatar: null, blockedAt: Date.parse('2026-10-17T03:00:00Z') }]) })
    render(<SettingsDrawer open onClose={vi.fn()} />)
    const section = (await screen.findByRole('heading', { name: '차단한 사람' })).closest('section') as HTMLElement
    fireEvent.click(await within(section).findByRole('button', { name: '빌드업님 차단 풀기' }))
    await waitFor(() => expect(remote.unblock).toHaveBeenCalledWith('other'))
    expect(await within(section).findByText('빌드업님의 차단을 풀었습니다.')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '빌드업님 차단 풀기' })).not.toBeInTheDocument()
  })

  it('가입을 마치지 않았으면 보이지 않는다', () => {
    vi.mocked(useAccount).mockReturnValue(halfway)
    render(<SettingsDrawer open onClose={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: '차단한 사람' })).not.toBeInTheDocument()
  })
})

describe('운영 화면', () => {
  const usage: Usage = { users: 3, maxUsers: 100, drafts: 1, dbBytes: 1, dbLimitBytes: 400, edgeCallsMonth: 1, edgeMonthLimit: 400_000, pastApiToday: 0, statCallsToday: 0, cacheRows: 0 }
  const daily: DailyActive = { today: '2026-10-18', since: '2026-10-14', visitorsSince: '2026-10-15', hasVisitors: true, days: [{ day: '2026-10-18', users: 4, visitors: 31 }] }

  const group = (patch: Partial<ReportGroup> = {}): ReportGroup => ({
    kind: 'post',
    targetId: 'p1',
    parts: ['cover'],
    reasons: { spam: 2, abuse: 1 },
    reportCount: 3,
    firstAt: Date.parse('2026-10-17T01:00:00Z'),
    lastAt: Date.parse('2026-10-18T02:30:00Z'),
    hidden: true,
    preview: '하프스페이스를 여는 법',
    authorId: 'other',
    authorNickname: '빌드업',
    authorSuspended: false,
    postId: 'p1',
    details: [],
    ...patch,
  })

  beforeEach(() => {
    vi.mocked(loadUsage).mockResolvedValue(usage)
    vi.mocked(loadDailyActive).mockResolvedValue(daily)
  })

  it('묶인 신고를 보여 주고, 숨겨진 것은 다시 보이게 한다', async () => {
    const remote = useModeration({ reports: vi.fn().mockResolvedValue([group()]) })
    render(<AdminPage />)
    const section = (await screen.findByRole('heading', { name: '신고 처리' })).closest('section') as HTMLElement
    const item = (await within(section).findByText('하프스페이스를 여는 법')).closest('li') as HTMLElement
    expect(item).toHaveTextContent('글 · 대표 사진')
    expect(item).toHaveTextContent('숨김')
    expect(item).toHaveTextContent('신고 3건')
    expect(item).toHaveTextContent('광고 · 도배 2, 욕설 · 괴롭힘 1')
    expect(item).toHaveTextContent('빌드업')
    expect(within(item).getByRole('link', { name: '글 보기' })).toHaveAttribute('href', '#/p/other/p1')
    // 숨겨진 것에는 "문제없음" 대신 "다시 보이기"가 있다.
    expect(within(item).queryByRole('button', { name: '문제없음' })).not.toBeInTheDocument()
    fireEvent.click(within(item).getByRole('button', { name: '다시 보이기' }))
    await waitFor(() => expect(remote.resolve).toHaveBeenCalledWith('post', 'p1', 'restore'))
    expect(await within(section).findByText('다시 보이게 했습니다.')).toBeInTheDocument()
  })

  it('삭제와 정지는 한 번 더 묻는다', async () => {
    const remote = useModeration({ reports: vi.fn().mockResolvedValue([group({ kind: 'comment', parts: [], hidden: false, preview: '나쁜 말', postId: 'p1' })]) })
    render(<AdminPage />)
    const item = (await screen.findByText('나쁜 말')).closest('li') as HTMLElement
    // 댓글은 글쓴이를 몰라 글로 잇지 않는다.
    expect(within(item).queryByRole('link')).not.toBeInTheDocument()

    fireEvent.click(within(item).getByRole('button', { name: '삭제' }))
    const ask = screen.getByRole('dialog', { name: '이 댓글을 삭제할까요?' })
    fireEvent.click(within(ask).getByRole('button', { name: '취소' }))
    expect(remote.resolve).not.toHaveBeenCalled()

    fireEvent.click(within(item).getByRole('button', { name: '글쓴이 정지' }))
    const suspend = screen.getByRole('dialog', { name: '빌드업님의 이용을 정지할까요?' })
    fireEvent.click(within(suspend).getByRole('button', { name: '정지' }))
    await waitFor(() => expect(remote.resolve).toHaveBeenCalledWith('comment', 'p1', 'suspend'))

    fireEvent.click(within(item).getByRole('button', { name: '문제없음' }))
    await waitFor(() => expect(remote.resolve).toHaveBeenCalledWith('comment', 'p1', 'dismiss'))
  })

  it('삭제를 확인하면 지우고 목록을 새로 읽는다', async () => {
    const remote = useModeration({ reports: vi.fn().mockResolvedValueOnce([group()]).mockResolvedValue([]) })
    render(<AdminPage />)
    const item = (await screen.findByText('하프스페이스를 여는 법')).closest('li') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: '삭제' }))
    const ask = screen.getByRole('dialog', { name: '이 글을 삭제할까요?' })
    expect(ask).toHaveTextContent('신고된 글 · 대표 사진을 지웁니다. 되돌릴 수 없습니다.')
    fireEvent.click(within(ask).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(remote.resolve).toHaveBeenCalledWith('post', 'p1', 'delete'))
    expect(await screen.findByText('처리할 신고가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('신고한 사람들이 적은 내용을 글자 그대로 보여 준다', async () => {
    useModeration({ reports: vi.fn().mockResolvedValue([group({ details: ['<b>광고</b> 링크가 세 번', '같은 글을 계속 올립니다'] })]) })
    render(<AdminPage />)
    const item = (await screen.findByText('하프스페이스를 여는 법')).closest('li') as HTMLElement
    expect(within(item).getByText('신고한 사람이 적은 내용')).toBeInTheDocument()
    expect(within(item).getByText('<b>광고</b> 링크가 세 번')).toBeInTheDocument()
    expect(within(item).getByText('같은 글을 계속 올립니다')).toBeInTheDocument()
    expect(item.querySelector('b')).toBeNull()
  })

  it('글은 지웠지만 사진 파일을 지우지 못하면 직접 지우라고 알린다', async () => {
    const remove = vi.fn().mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const server = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { cover: 'other/p1.webp' }, error: null }) })) })) })),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => ({ remove })) },
    }
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(server as never)
    const remote = useModeration({ reports: vi.fn().mockResolvedValueOnce([group()]).mockResolvedValue([]) })
    render(<AdminPage />)
    const item = (await screen.findByText('하프스페이스를 여는 법')).closest('li') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: '삭제' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('글은 지웠지만 대표 사진 파일은 지우지 못했습니다. Supabase 보관함 post-covers에서 other/p1.webp 파일을 직접 지워 주세요.')).toBeInTheDocument()
    expect(remote.resolve).toHaveBeenCalledWith('post', 'p1', 'delete')
    expect(screen.getByText('삭제했습니다.')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('닫힌 신고를 보고, 정지된 글쓴이의 정지를 푼다', async () => {
    const remote = useModeration({ reports: vi.fn(async (status: string) => (status === 'closed' ? [group({ hidden: false, authorSuspended: true, preview: '지난 신고' })] : [])) })
    render(<AdminPage />)
    expect(await screen.findByText('처리할 신고가 없습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '닫힌 신고' }))
    const item = (await screen.findByText('지난 신고')).closest('li') as HTMLElement
    expect(remote.reports).toHaveBeenCalledWith('closed')
    expect(within(item).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    fireEvent.click(within(item).getByRole('button', { name: '정지 풀기' }))
    await waitFor(() => expect(remote.unsuspend).toHaveBeenCalledWith('other'))
  })

  it('금칙어를 더하고 뺀다', async () => {
    const words = ['나쁜말']
    const remote = useModeration({
      bannedWords: vi.fn(async () => [...words]),
      addBannedWord: vi.fn(async (word: string) => void words.push(word)),
      removeBannedWord: vi.fn(async (word: string) => void words.splice(words.indexOf(word), 1)),
    })
    render(<AdminPage />)
    const section = (await screen.findByRole('heading', { name: '금칙어' })).closest('section') as HTMLElement
    expect(await within(section).findByText('나쁜말')).toBeInTheDocument()
    const input = within(section).getByLabelText('더할 금칙어')
    expect(input).toHaveAttribute('maxLength', '30')
    fireEvent.change(input, { target: { value: '광고문구' } })
    fireEvent.click(within(section).getByRole('button', { name: '더하기' }))
    expect(await within(section).findByText('광고문구')).toBeInTheDocument()
    expect(remote.addBannedWord).toHaveBeenCalledWith('광고문구')
    fireEvent.click(within(section).getByRole('button', { name: '나쁜말 빼기' }))
    await waitFor(() => expect(within(section).queryByText('나쁜말')).not.toBeInTheDocument())
  })

  it('방문자를 웹 · 앱으로 나눠 보내면 표에 두 칸이 생긴다', async () => {
    vi.mocked(loadDailyActive).mockResolvedValue({ ...daily, hasSources: true, days: [{ day: '2026-10-18', users: 4, visitors: 31, web: 20, app: 11 }] })
    render(<AdminPage />)
    const table = await screen.findByRole('region', { name: '날짜별 방문자 표' })
    expect(within(table).getByRole('columnheader', { name: '웹' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '앱' })).toBeInTheDocument()
    expect(within(table).getByText('20명')).toBeInTheDocument()
    expect(within(table).getByText('11명')).toBeInTheDocument()
  })

  it('나눔이 없으면 예전처럼 합계만 보인다', async () => {
    render(<AdminPage />)
    const table = await screen.findByRole('region', { name: '날짜별 방문자 표' })
    expect(within(table).queryByRole('columnheader', { name: '웹' })).not.toBeInTheDocument()
  })
})

describe('방문자 웹 · 앱 나눔 읽기', () => {
  it('날짜별 항목에 web · app 이 오면 나눠 읽고, 세기 전의 날은 비운다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        today: '2026-10-18',
        since: '2026-10-16',
        visitors_since: '2026-10-17',
        days: [
          { day: '2026-10-18', users: 2, visitors: 9, web: 6, app: 3 },
          { day: '2026-10-17', users: 1, visitors: 4, web: 4 },
          { day: '2026-10-16', users: 1, visitors: 0 },
        ],
      },
      error: null,
    })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue({ rpc } as never)
    const { loadDailyActive: realLoad } = await vi.importActual<typeof import('../account/usage')>('../account/usage')
    const result = await realLoad()
    expect(result).toMatchObject({
      hasSources: true,
      days: [
        { day: '2026-10-18', web: 6, app: 3 },
        { day: '2026-10-17', web: 4, app: null },
        { day: '2026-10-16', web: null, app: null },
      ],
    })
    spy.mockRestore()
  })
})

describe('방문자 나눔을 처음 센 날', () => {
  it('sources_since 앞의 날은 web · app 이 0 이어도 세지 않음(null)으로 본다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        today: '2026-10-18',
        since: '2026-10-16',
        visitors_since: '2026-10-16',
        sources_since: '2026-10-18',
        days: [
          { day: '2026-10-18', users: 2, visitors: 9, web: 6, app: 3 },
          { day: '2026-10-17', users: 1, visitors: 4, web: 0, app: 0 },
        ],
      },
      error: null,
    })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue({ rpc } as never)
    const { loadDailyActive: realLoad } = await vi.importActual<typeof import('../account/usage')>('../account/usage')
    expect(await realLoad()).toMatchObject({
      hasSources: true,
      sourcesSince: '2026-10-18',
      days: [
        { day: '2026-10-18', web: 6, app: 3 },
        { day: '2026-10-17', web: null, app: null },
      ],
    })
    spy.mockRestore()
  })
})

describe('신고된 대상 지우기', () => {
  // 보관함 · 표 · 함수 호출을 흉내 내는 가짜 서버
  function fakeServer({ cover = null, avatar = null, removeFails = false }: { cover?: string | null; avatar?: string | null; removeFails?: boolean } = {}) {
    const remove = removeFails ? vi.fn().mockRejectedValue(new Error('storage down')) : vi.fn().mockResolvedValue({ data: [], error: null })
    const storage = { from: vi.fn(() => ({ remove })) }
    const maybeSingle = vi.fn().mockResolvedValue({ data: cover === null ? null : { cover }, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue({ data: avatar === null ? [] : [{ user_id: 'other', avatar }], error: null })
    return { server: { from, rpc, storage }, from, select, eq, rpc, storage, remove }
  }

  it('글을 지우기 전에 대표 사진 위치를 읽고, 지운 뒤 post-covers 에서 지운다', async () => {
    const fake = fakeServer({ cover: 'other/p1.webp' })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(fake.server as never)
    const remote = useModeration()
    const { deleteReported } = await import('./deleteReported')
    expect(await deleteReported({ kind: 'post', targetId: 'p1' })).toEqual({ leftover: null })
    expect(fake.from).toHaveBeenCalledWith('posts')
    expect(fake.select).toHaveBeenCalledWith('cover')
    expect(fake.eq).toHaveBeenCalledWith('id', 'p1')
    expect(remote.resolve).toHaveBeenCalledWith('post', 'p1', 'delete')
    expect(fake.storage.from).toHaveBeenCalledWith('post-covers')
    expect(fake.remove).toHaveBeenCalledWith(['other/p1.webp'])
    // 사진은 행을 지운 뒤에 지운다.
    expect(vi.mocked(remote.resolve).mock.invocationCallOrder[0]).toBeLessThan(fake.remove.mock.invocationCallOrder[0])
    spy.mockRestore()
  })

  it('사용자를 지우면 프로필 사진을 avatars 에서 지운다', async () => {
    const fake = fakeServer({ avatar: 'other/a.webp' })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(fake.server as never)
    useModeration()
    const { deleteReported } = await import('./deleteReported')
    await deleteReported({ kind: 'user', targetId: 'other' })
    expect(fake.rpc).toHaveBeenCalledWith('profile_summary', { p_user: 'other' })
    expect(fake.storage.from).toHaveBeenCalledWith('avatars')
    expect(fake.remove).toHaveBeenCalledWith(['other/a.webp'])
    spy.mockRestore()
  })

  it('댓글이나 사진 없는 글은 보관함을 건드리지 않고, 사진 정리가 실패해도 조용히 넘어간다', async () => {
    const plain = fakeServer()
    let spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(plain.server as never)
    useModeration()
    const { deleteReported } = await import('./deleteReported')
    await deleteReported({ kind: 'comment', targetId: 'k1' })
    await deleteReported({ kind: 'post', targetId: 'p2' })
    expect(plain.storage.from).not.toHaveBeenCalled()
    spy.mockRestore()

    // remove() 는 실패해도 throw 하지 않고 { error } 를 돌려준다.
    const refused = fakeServer({ cover: 'other/p1.webp' })
    refused.remove.mockResolvedValue({ data: null, error: { message: 'not allowed' } })
    spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(refused.server as never)
    expect(await deleteReported({ kind: 'post', targetId: 'p1' })).toEqual({ leftover: { bucket: 'post-covers', path: 'other/p1.webp' } })
    spy.mockRestore()

    const broken = fakeServer({ cover: 'other/p1.webp', removeFails: true })
    spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(broken.server as never)
    await expect(deleteReported({ kind: 'post', targetId: 'p1' })).resolves.toEqual({ leftover: { bucket: 'post-covers', path: 'other/p1.webp' } })
    spy.mockRestore()
  })

  it('행 삭제가 거절되면 오류를 올리고 사진은 지우지 않는다', async () => {
    const fake = fakeServer({ cover: 'other/p1.webp' })
    const spy = vi.spyOn(await import('../../lib/supabase'), 'getServer').mockResolvedValue(fake.server as never)
    useModeration({ resolve: vi.fn().mockRejectedValue(new ModerationError('not_admin')) })
    const { deleteReported } = await import('./deleteReported')
    await expect(deleteReported({ kind: 'post', targetId: 'p1' })).rejects.toBeInstanceOf(ModerationError)
    expect(fake.remove).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
