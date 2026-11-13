import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createColumn, putMedia, updateColumn } from '../../db/store'
import { useAccount, type Account } from '../account/session'
import { FeedPane } from './FeedPane'
import { isOnline, timeAgo } from './helpers'
import { columnImages } from './cover'
import { excerptOf, feedBody, publishErrorText, PublishError, FeedError, type FeedPost, type FeedRemote } from '@highpress/core/feed'
import { publishColumn } from './publish'
import { PublishButton } from './PublishButton'
import { getFeedRemote } from './remote'

// 서버 호출은 가짜로 바꾼다. 실제 동작은 Supabase에 0003_feed.sql을 넣은 뒤 브라우저에서 확인한다.
vi.mock('../account/session', async (original) => ({ ...(await original<typeof import('../account/session')>()), useAccount: vi.fn() }))
vi.mock('./remote', async (original) => ({ ...(await original<typeof import('./remote')>()), getFeedRemote: vi.fn() }))

// 시험 환경의 저장소는 사진을 Blob 그대로 돌려주지 않아 blob: 주소를 만들지 못한다. 주소 만들기만 가짜로 바꾼다.
let urlCount = 0
Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test/${++urlCount}`), revokeObjectURL: vi.fn() })

const signedIn: Account = { status: 'in', userId: 'me', email: 'me@example.com', accessToken: 't', profile: { nickname: '나의 이름' }, serverDown: false }

const post = (patch: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p1',
  userId: 'other',
  nickname: '빌드업',
  columnId: 'c1',
  title: '하프스페이스를 여는 법',
  excerpt: '풀백이 안으로 들어오면 생기는 일',
  createdAt: Date.now() - 5 * 60_000,
  likeCount: 2,
  commentCount: 1,
  liked: false,
  club: null,
  cover: null,
  avatar: null,
  ...patch,
})

function fakeRemote(patch: Partial<FeedRemote> = {}): FeedRemote {
  return {
    page: vi.fn().mockResolvedValue([post()]),
    post: vi.fn().mockResolvedValue(post()),
    popular: vi.fn().mockResolvedValue([
      { userId: 'other', nickname: '빌드업', club: 'ars', lastSeenAt: Date.now() - 60_000, likeCount: 7, fresh: true, avatar: null },
      { userId: 'me', nickname: '나의 이름', club: null, lastSeenAt: null, likeCount: 1, fresh: false, avatar: null },
    ]),
    searchPeople: vi.fn().mockResolvedValue([{ userId: 'other', nickname: '빌드업', club: 'ars', lastSeenAt: null, postCount: 3, fresh: false, avatar: null }]),
    profile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    saveAvatar: vi.fn().mockResolvedValue(null),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    body: vi.fn().mockResolvedValue(null),
    cover: vi.fn().mockResolvedValue(null),
    publish: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    like: vi.fn().mockResolvedValue(undefined),
    unlike: vi.fn().mockResolvedValue(undefined),
    comments: vi.fn().mockResolvedValue([{ id: 'k1', userId: 'me', nickname: '나의 이름', body: '잘 읽었습니다', createdAt: Date.now(), parentId: null, likeCount: 0, liked: false, deleted: false, avatar: null }]),
    addComment: vi.fn().mockResolvedValue(undefined),
    removeComment: vi.fn().mockResolvedValue(true),
    likeComment: vi.fn().mockResolvedValue(undefined),
    unlikeComment: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    ...patch,
  }
}

const useRemote = (remote: FeedRemote) => {
  vi.mocked(getFeedRemote).mockResolvedValue(remote)
  return remote
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(signedIn)
})

describe('피드에 올리는 본문', () => {
  it('사진 자리는 빼고 글과 스탯 표만 남긴다', () => {
    const cleaned = feedBody({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '첫 문단' }] },
        { type: 'image', attrs: { mediaId: 'm1', src: 'https://tracker.example/x.png' } },
        { type: 'statBlock', attrs: { snapshot: { view: 'table' } } },
      ],
    })
    expect(cleaned.content?.map((node) => node.type)).toEqual(['paragraph', 'statBlock'])
  })

  it('서식 값에 다른 선언을 끼워 넣지 못한다', () => {
    const cleaned = feedBody({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { lineHeight: '2; position: fixed' },
          content: [
            {
              type: 'text',
              text: '글',
              marks: [
                { type: 'textStyle', attrs: { color: '#ff0000', fontFamily: 'x; background: url(https://a.example)' } },
                { type: 'link', attrs: { href: 'https://example.com/a;b' } },
              ],
            },
          ],
        },
      ],
    })
    const paragraph = cleaned.content![0]
    expect(paragraph.attrs).toEqual({ lineHeight: null })
    expect(paragraph.content![0].marks).toEqual([
      { type: 'textStyle', attrs: { color: '#ff0000', fontFamily: null } },
      { type: 'link', attrs: { href: 'https://example.com/a;b' } },
    ])
  })

  it('지나치게 깊은 본문은 거절한다', () => {
    let node: Record<string, unknown> = { type: 'text', text: 'x' }
    for (let i = 0; i < 150; i += 1) node = { type: 'blockquote', content: [node] }
    expect(() => feedBody(node)).toThrow('너무 깊게')
  })

  it('앞부분을 한 줄로 뽑는다', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '첫 문단입니다.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '둘째  문단' }] },
      ],
    }
    expect(excerptOf(doc)).toBe('첫 문단입니다. 둘째 문단')
    expect(excerptOf(doc, 5)).toBe('첫 문단입…')
  })
})

describe('시각과 접속 표시', () => {
  it('지난 시간을 짧게 적는다', () => {
    const now = 1_700_000_000_000
    expect(timeAgo(now - 20_000, now)).toBe('방금')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5분 전')
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3시간 전')
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2일 전')
  })

  it('10분 안에 앱을 연 사람만 접속 중이다', () => {
    const now = 1_700_000_000_000
    expect(isOnline({ lastSeenAt: now - 9 * 60_000 }, now)).toBe(true)
    expect(isOnline({ lastSeenAt: now - 11 * 60_000 }, now)).toBe(false)
    expect(isOnline({ lastSeenAt: null }, now)).toBe(false)
  })
})

// 파일에서 처음 그리는 화면은 모듈을 불러오느라 느릴 수 있어 넉넉히 기다린다.
const SLOW = { timeout: 5000 }

describe('피드 화면', () => {
  it('로그인하지 않아도 피드를 읽는다. 좋아요 · 팔로잉은 로그인 안내로 바뀐다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    const remote = useRemote(fakeRemote())
    render(<FeedPane />)
    expect(await screen.findByRole('heading', { name: '하프스페이스를 여는 법' }, SLOW)).toBeInTheDocument()
    expect((await screen.findAllByRole('link', { name: /빌드업/ })).length).toBeGreaterThan(0)
    // 남의 글이든 내 글이든 내리기 단추는 없다.
    expect(screen.queryByRole('button', { name: '피드에서 내리기' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '좋아요 2개' }))
    expect(screen.getByText(/좋아요는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 · 가입' })).toBeInTheDocument()
    expect(remote.like).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))

    fireEvent.click(screen.getByRole('button', { name: '팔로잉' }))
    expect(screen.getByText(/팔로잉 모아 보기는 로그인한 뒤에/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '팔로잉' })).toHaveAttribute('aria-pressed', 'false')
    expect(remote.page).toHaveBeenCalledTimes(1)
  })

  it('서버가 아직 읽기를 열지 않았으면 로그인하지 않은 사람에게 로그인 안내를 보여 준다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    useRemote(fakeRemote({ page: vi.fn().mockRejectedValue(new FeedError('denied')) }))
    render(<FeedPane />)
    expect(await screen.findByRole('button', { name: 'Google로 로그인' }, SLOW)).toBeInTheDocument()
    expect(screen.getByText(/지금은 로그인해야 볼 수 있습니다/)).toBeInTheDocument()
  })

  it('계정을 확인하는 동안에는 피드를 읽지 않고 기다린다', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'loading' })
    useRemote(fakeRemote())
    render(<FeedPane />)
    expect(screen.getByRole('status', { name: '피드를 불러오는 중' })).toBeInTheDocument()
    expect(getFeedRemote).not.toHaveBeenCalled()
  })

  it('올라온 칼럼과 인기 칼럼리스트를 보여 준다', async () => {
    useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([post({ club: 'ars' })]) }))
    render(<FeedPane />)
    expect(await screen.findByRole('heading', { name: '하프스페이스를 여는 법' })).toBeInTheDocument()
    expect(screen.getByText('5분 전')).toBeInTheDocument()
    // 글쓴이를 누르면 프로필로 간다.
    expect(screen.getByRole('link', { name: '빌드업 님의 프로필' })).toHaveAttribute('href', '#/u/other')

    const rail = within(screen.getByRole('complementary', { name: '인기 칼럼리스트' }))
    const links = await rail.findAllByRole('link')
    // 서버가 준 순서(최근 30일 좋아요 순) 그대로.
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#/u/other', '#/u/me'])
    expect(links[0]).toHaveTextContent('새 글')
    expect(links[1]).toHaveTextContent('나의 이름 (나)')
  })

  it('리그를 누르면 그 리그의 글을 불러오고, 펼쳐진 구단을 누르면 그 구단의 글만 불러온다', async () => {
    const remote = useRemote(fakeRemote())
    render(<FeedPane />)
    const leagues = within(screen.getByRole('group', { name: '리그별로 보기' }))
    // 전체가 기본이고, 리그는 다섯이다. 처음에는 모든 구단이 리그별로 묶여 보인다.
    expect(leagues.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
    expect(leagues.getAllByRole('button')).toHaveLength(6)
    for (const name of ['프리미어리그', '라리가', '분데스리가', '세리에 A', '리그 1']) expect(leagues.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    for (const [name, size] of [['프리미어리그', 6], ['라리가', 3], ['분데스리가', 3], ['세리에 A', 3], ['리그 1', 1]] as const) {
      expect(within(screen.getByRole('group', { name: `${name} 구단` })).getAllByRole('button')).toHaveLength(size)
    }
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: null, clubs: null, following: false, query: '', sort: 'new' }))

    // 리그: 그 리그 구단들의 글
    fireEvent.click(leagues.getByRole('button', { name: /프리미어리그/ }))
    await waitFor(() =>
      expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: null, clubs: ['ars', 'mci', 'liv', 'mun', 'che', 'tot'], following: false, query: '', sort: 'new' }),
    )
    expect(screen.getByText('프리미어리그 칼럼만 보는 중')).toBeInTheDocument()
    const clubs = within(screen.getByRole('group', { name: '프리미어리그 구단' }))
    expect(clubs.getAllByRole('button')).toHaveLength(6)
    expect(screen.queryByRole('group', { name: '라리가 구단' })).not.toBeInTheDocument()

    // 구단: 그 구단의 글만. 다시 누르면 리그 전체로 돌아간다.
    fireEvent.click(clubs.getByRole('button', { name: '아스널' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: 'ars', clubs: null, following: false, query: '', sort: 'new' }))
    expect(screen.getByText('아스널 칼럼만 보는 중')).toBeInTheDocument()
    fireEvent.click(clubs.getByRole('button', { name: '아스널' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith(expect.objectContaining({ club: null, clubs: ['ars', 'mci', 'liv', 'mun', 'che', 'tot'] })))

    // 전체: 모든 리그의 구단이 다시 보이고 거르지 않는다.
    fireEvent.click(leagues.getByRole('button', { name: '전체' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: null, clubs: null, following: false, query: '', sort: 'new' }))
    expect(screen.getByRole('group', { name: '라리가 구단' })).toBeInTheDocument()

    // 전체에서 구단을 바로 누르면 그 구단의 글만 본다.
    fireEvent.click(screen.getByRole('button', { name: '레알 마드리드' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith(expect.objectContaining({ club: 'rma', clubs: null })))
    expect(screen.getByText('레알 마드리드 칼럼만 보는 중')).toBeInTheDocument()
  })

  it('팔로잉을 누르면 팔로우한 사람의 글만 불러온다', async () => {
    const remote = useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([]) }))
    render(<FeedPane />)
    fireEvent.click(screen.getByRole('button', { name: '팔로잉' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: null, clubs: null, following: true, query: '', sort: 'new' }))
    expect(await screen.findByText('팔로우한 사람의 칼럼이 아직 없습니다')).toBeInTheDocument()
  })

  it('좋아요순을 누르면 좋아요가 많은 순으로 불러오고, 다음 쪽은 읽은 글 수만큼 건너뛴다', async () => {
    const full = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, userId: 'other', nickname: '남', columnId: `c${index}`, title: `글 ${index}`, excerpt: '', createdAt: 1000 - index, likeCount: 20 - index, commentCount: 0, liked: false, club: null }))
    const remote = useRemote(fakeRemote({ page: vi.fn().mockResolvedValue(full) }))
    render(<FeedPane />)
    const order = within(screen.getByRole('group', { name: '늘어놓는 순서' }))
    expect(order.getByRole('button', { name: '최신' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(order.getByRole('button', { name: '좋아요순' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, offset: 0, author: null, club: null, clubs: null, following: false, query: '', sort: 'top' }))
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith(expect.objectContaining({ before: undefined, offset: 20, sort: 'top' })))
    // 같은 글이 다시 와도 두 번 보이지 않는다.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
  })

  it('검색어가 있으면 그 말로 글과 칼럼리스트를 찾고, 지울 수 있다', async () => {
    const remote = useRemote(fakeRemote())
    const clear = vi.fn()
    render(<FeedPane query="  빌드업 " onClearQuery={clear} />)
    await waitFor(() => expect(remote.page).toHaveBeenLastCalledWith({ before: undefined, author: null, club: null, clubs: null, following: false, query: '빌드업', sort: 'new' }))
    expect(remote.searchPeople).toHaveBeenCalledWith('빌드업')
    const found = within(await screen.findByRole('list', { name: '찾은 칼럼리스트' }))
    expect(found.getByRole('link')).toHaveAttribute('href', '#/u/other')
    expect(found.getByText('칼럼 3편')).toBeInTheDocument()
    expect(screen.getByText('“빌드업” 칼럼만 보는 중')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '검색 지우기' }))
    expect(clear).toHaveBeenCalled()
  })

  it('검색 결과가 없으면 어디서 찾는지 알려 준다', async () => {
    useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([]), searchPeople: vi.fn().mockResolvedValue([]) }))
    render(<FeedPane query="없는말" />)
    expect(await screen.findByRole('heading', { name: '“없는말”에 맞는 칼럼이 없습니다' })).toBeInTheDocument()
  })

  it('좋아요를 누르면 바로 반영하고 서버에 보낸다', async () => {
    const remote = useRemote(fakeRemote())
    render(<FeedPane />)
    fireEvent.click(await screen.findByRole('button', { name: '좋아요 2개' }))
    expect(screen.getByRole('button', { name: '좋아요 3개' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(remote.like).toHaveBeenCalledWith('p1'))

    fireEvent.click(screen.getByRole('button', { name: '좋아요 3개' }))
    await waitFor(() => expect(remote.unlike).toHaveBeenCalledWith('p1'))
    expect(screen.getByRole('button', { name: '좋아요 2개' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('서버가 거절하면 좋아요를 되돌리고 알린다', async () => {
    useRemote(fakeRemote({ like: vi.fn().mockRejectedValue(new FeedError('failed')) }))
    render(<FeedPane />)
    fireEvent.click(await screen.findByRole('button', { name: '좋아요 2개' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('좋아요를 반영하지 못했습니다')
    expect(screen.getByRole('button', { name: '좋아요 2개' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('카드는 미리보기만 보여 주고, 제목과 댓글 수를 누르면 글 화면으로 간다', async () => {
    useRemote(fakeRemote())
    render(<FeedPane />)
    const title = await screen.findByRole('heading', { name: '하프스페이스를 여는 법' })
    expect(title.closest('a')).toHaveAttribute('href', '#/p/other/p1')
    expect(screen.getByRole('link', { name: '댓글 1개 보기' })).toHaveAttribute('href', '#/p/other/p1')
    // 전체 글과 댓글은 글 화면에서 읽는다.
    expect(screen.queryByRole('button', { name: '전체 글 보기' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('댓글 쓰기')).not.toBeInTheDocument()
  })

  it('카드의 빈 자리를 눌러도 글 화면으로 가고, 좋아요 단추는 제 할 일만 한다', async () => {
    const remote = useRemote(fakeRemote())
    window.location.hash = '#/'
    render(<FeedPane />)
    const title = await screen.findByRole('heading', { name: '하프스페이스를 여는 법' })
    fireEvent.click(screen.getByRole('button', { name: '좋아요 2개' }))
    await waitFor(() => expect(remote.like).toHaveBeenCalledWith('p1'))
    expect(window.location.hash).toBe('#/')
    fireEvent.click(title.closest('article') as HTMLElement)
    expect(window.location.hash).toBe('#/p/other/p1')
    window.location.hash = '#/'
  })

  it('내 글만 피드에서 내릴 수 있다', async () => {
    const remote = useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([post(), post({ id: 'p2', userId: 'me', nickname: '나의 이름', title: '내가 쓴 글' })]) }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<FeedPane />)
    await screen.findByText('내가 쓴 글')
    const removers = screen.getAllByRole('button', { name: '피드에서 내리기' })
    expect(removers).toHaveLength(1)
    fireEvent.click(removers[0])
    await waitFor(() => expect(remote.unpublish).toHaveBeenCalledWith('p2'))
    await waitFor(() => expect(screen.queryByText('내가 쓴 글')).not.toBeInTheDocument())
    expect(confirm.mock.calls[0][0]).toContain('이 기기의 칼럼은 그대로 남습니다')
    confirm.mockRestore()
  })

  it('올라온 글이 없으면 올리는 방법을 안내한다', async () => {
    useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([]) }))
    render(<FeedPane />)
    expect(await screen.findByText('아직 올라온 칼럼이 없습니다')).toBeInTheDocument()
  })

  it('불러오지 못하면 그 사실을 알린다', async () => {
    useRemote(fakeRemote({ page: vi.fn().mockRejectedValue(new FeedError('failed')) }))
    render(<FeedPane />)
    expect(await screen.findByRole('alert')).toHaveTextContent('피드를 불러오지 못했습니다')
  })
})

describe('피드에 올리기', () => {
  it('서버 설정이 없으면 버튼이 없다', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'off' })
    const { container } = render(<PublishButton columnId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('로그인하지 않았으면 올리는 창 대신 로그인 안내가 열리고, 아무것도 올라가지 않는다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    const remote = useRemote(fakeRemote())
    render(<PublishButton columnId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    expect(await screen.findByText(/피드에 올리기는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 · 가입' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '올리기' })).not.toBeInTheDocument()
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('무엇이 공개되는지 알리고, 고른 구단과 함께 사진을 뺀 글을 올린다', async () => {
    const remote = useRemote(fakeRemote())
    const column = await createColumn()
    await updateColumn(column.id, {
      title: '  전환 수비  ',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }, { type: 'image', attrs: { mediaId: 'm1', src: null } }] },
    })
    render(<PublishButton columnId={column.id} />)

    // 취소하면 올리지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    expect(await screen.findByText(/사진과 영상은 올라가지 않습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(remote.publish).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    fireEvent.change(await screen.findByLabelText('구단'), { target: { value: 'liv' } })
    fireEvent.click(screen.getByRole('button', { name: '올리기' }))
    expect(await screen.findByRole('status')).toHaveTextContent('피드에 올렸습니다.')
    expect(remote.publish).toHaveBeenCalledWith({
      columnId: column.id,
      title: '전환 수비',
      excerpt: '본문',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }] },
      club: 'liv',
      cover: null,
    })

    // 다시 열면 지난번에 고른 구단이 그대로 있다.
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    expect(await screen.findByLabelText('구단')).toHaveValue('liv')
  })

  it('본문 사진 가운데 하나를 대표 사진으로 골라 올린다', async () => {
    const remote = useRemote(fakeRemote())
    const column = await createColumn()
    const first = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob(['a'], { type: 'image/png' }), name: '첫째.png' })
    const second = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob(['bb'], { type: 'image/png' }), name: '둘째.png' })
    const clip = await putMedia({ columnId: column.id, kind: 'video', temp: false, blob: new Blob(['v'], { type: 'video/mp4' }), name: '영상.mp4' })
    const image = (mediaId: string) => ({ type: 'image', attrs: { mediaId, src: null } })
    await updateColumn(column.id, { title: '제목', body: { type: 'doc', content: [image(first.id), image(clip.id), image('없는-사진'), image(second.id), image(first.id)] } })

    // 영상과 사라진 사진은 빼고, 본문 순서대로 한 번씩만 나온다.
    expect((await columnImages(column.id)).map((choice) => choice.mediaId)).toEqual([first.id, second.id])

    // 처음에는 첫 사진이 골라져 있다. 둘째로 바꿔 올린다.
    const shrunk = new Blob(['작게'], { type: 'image/webp' })
    const shrink = vi.fn().mockResolvedValue(shrunk)
    await publishColumn(column.id, null, second.id, shrink)
    expect(shrink).toHaveBeenCalledTimes(1)
    expect(remote.publish).toHaveBeenLastCalledWith(expect.objectContaining({ columnId: column.id, cover: shrunk }))

    // 고른 사진을 읽지 못하면 올리지 않고 이유를 알린다.
    vi.mocked(remote.publish).mockClear()
    const failure = await publishColumn(column.id, null, '없는-사진', shrink).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(PublishError)
    expect(publishErrorText(failure)).toContain('고른 사진을 읽지 못했습니다')
    expect(remote.publish).not.toHaveBeenCalled()
    // 글은 올라갔는데 사진만 못 올린 경우의 안내
    expect(publishErrorText(new FeedError('cover'))).toContain('대표 사진은 올리지 못했습니다')
  })

  it('올리기 창에서 사진을 고르고, 사진 없이도 올릴 수 있다', async () => {
    const remote = useRemote(fakeRemote())
    const column = await createColumn()
    const photo = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob(['a'], { type: 'image/png' }), name: '첫째.png' })
    await updateColumn(column.id, { title: '제목', body: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: photo.id, src: null } }] } })
    render(<PublishButton columnId={column.id} />)

    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    const picker = within(await screen.findByRole('group', { name: '대표 사진' }))
    expect(picker.getByRole('button', { name: '1번째 사진' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(picker.getByRole('button', { name: '사진 없이' }))
    fireEvent.click(screen.getByRole('button', { name: '올리기' }))
    expect(await screen.findByRole('status')).toHaveTextContent('피드에 올렸습니다.')
    expect(remote.publish).toHaveBeenLastCalledWith(expect.objectContaining({ cover: null }))

    // 다시 열면 "사진 없이"가 그대로 골라져 있다.
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    expect(within(await screen.findByRole('group', { name: '대표 사진' })).getByRole('button', { name: '사진 없이' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('대표 사진이 있는 글은 카드에 사진을 보여 준다', async () => {
    const remote = useRemote(fakeRemote({ page: vi.fn().mockResolvedValue([post({ cover: 'other/c1' })]), cover: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/webp' })) }))
    render(<FeedPane />)
    expect(await screen.findByRole('img', { name: '하프스페이스를 여는 법 대표 사진' })).toBeInTheDocument()
    expect(remote.cover).toHaveBeenCalledWith('other/c1')
  })

  it('제목이 없으면 올리지 않고 이유를 알린다', async () => {
    const remote = useRemote(fakeRemote())
    const column = await createColumn()
    render(<PublishButton columnId={column.id} />)
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    fireEvent.click(await screen.findByRole('button', { name: '올리기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 적은 뒤 올려 주세요.')
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('한도에 닿으면 한도를 알려 준다', async () => {
    useRemote(fakeRemote({ publish: vi.fn().mockRejectedValue(new FeedError('quota')) }))
    const column = await createColumn()
    await updateColumn(column.id, { title: '제목' })
    render(<PublishButton columnId={column.id} />)
    fireEvent.click(screen.getByRole('button', { name: '피드에 올리기' }))
    fireEvent.click(await screen.findByRole('button', { name: '올리기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('20편까지 올릴 수 있습니다')
  })
})
