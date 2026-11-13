import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { avatarUrl } from '../../lib/avatar'
import { parseHash, toHash } from '../../lib/router'
import { useAccount, type Account } from '../account/session'
import { buildThreads, countReplies, FeedError, type FeedComment, type FeedPost, type FeedRemote } from '@highpress/core/feed'
import { getFeedRemote } from '../feed/remote'
import { PostPage } from './PostPage'

vi.mock('../account/session', async (original) => ({ ...(await original<typeof import('../account/session')>()), useAccount: vi.fn() }))
vi.mock('../feed/remote', async (original) => ({ ...(await original<typeof import('../feed/remote')>()), getFeedRemote: vi.fn() }))
// 본문은 에디터를 쓴다. 여기서는 글 화면의 짜임만 본다.
vi.mock('../feed/PostBody', () => ({ default: ({ postId }: { postId: string }) => <div data-testid="post-body">{postId}</div> }))

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
  commentCount: 2,
  liked: false,
  club: 'ars',
  cover: null,
  avatar: null,
  ...patch,
})

const others = [
  post({ id: 'p2', title: '역습은 세 번의 패스로', likeCount: 9 }),
  post({ id: 'p3', title: '미드필드의 간격', likeCount: 4 }),
  post({ id: 'p4', title: '공이 없을 때', likeCount: 0 }),
]

const comment = (patch: Partial<FeedComment> = {}): FeedComment => ({ id: 'k0', userId: 'other', nickname: '빌드업', body: '댓글', createdAt: Date.now(), parentId: null, likeCount: 0, liked: false, deleted: false, avatar: null, ...patch })

const mine = post({ id: 'p9', title: '같은 글쓴이의 지난 글', likeCount: 1 })

function useRemote(patch: Partial<FeedRemote> = {}): FeedRemote {
  const remote = {
    // 좋아요순은 좋아요가 많은 글부터, 최신순은 올라온 순서대로 온다.
    // 글쓴이로 거르면 그 사람의 글만 온다 (여기서는 지금 읽는 글과 mine).
    page: vi.fn(async ({ sort, author }: { sort?: string; author?: string }) => (author ? [post(), mine] : sort === 'top' ? [others[0], others[1], post(), others[2]] : [post(), ...others])),
    post: vi.fn().mockResolvedValue(post()),
    profile: vi.fn().mockResolvedValue({ userId: 'other', nickname: '빌드업', bio: '전술 장면을 뜯어봅니다', club: 'ars', lastSeenAt: null, postCount: 4, followerCount: 12, followingCount: 3, likeCount: 40, following: false, fresh: true }),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    like: vi.fn().mockResolvedValue(undefined),
    unlike: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    cover: vi.fn().mockResolvedValue(null),
    comments: vi.fn().mockResolvedValue([comment({ id: 'k1', userId: 'me', nickname: '나의 이름', body: '내 댓글' }), comment({ id: 'k2', body: '남의 댓글', likeCount: 3 })]),
    addComment: vi.fn().mockResolvedValue(undefined),
    removeComment: vi.fn().mockResolvedValue(true),
    likeComment: vi.fn().mockResolvedValue(undefined),
    unlikeComment: vi.fn().mockResolvedValue(undefined),
    ...patch,
  } as unknown as FeedRemote
  vi.mocked(getFeedRemote).mockResolvedValue(remote)
  return remote
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(signedIn)
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  // jsdom 에는 화면을 옮기는 함수가 없다.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('글 주소', () => {
  it('#/p/글쓴이/글 로 오간다', () => {
    expect(parseHash('#/p/0f3a-12/9b-7')).toEqual({ name: 'post', author: '0f3a-12', id: '9b-7' })
    expect(toHash({ name: 'post', author: '0f3a-12', id: '9b-7' })).toBe('#/p/0f3a-12/9b-7')
    expect(parseHash('#/p/0f3a-12')).toEqual({ name: 'home' })
    expect(parseHash('#/p/a/b/c')).toEqual({ name: 'home' })
  })
})

describe('글 화면', () => {
  it('글쓴이 · 제목 · 본문을 보여 주고, 그 아래에서 댓글을 읽고 쓴다', async () => {
    const remote = useRemote()
    render(<PostPage author="other" postId="p1" />)
    expect(await screen.findByRole('heading', { name: '하프스페이스를 여는 법', level: 1 })).toBeInTheDocument()
    expect(remote.post).toHaveBeenCalledWith('other', 'p1')
    expect(screen.getByRole('link', { name: '빌드업 님의 프로필' })).toHaveAttribute('href', '#/u/other')
    expect(await screen.findByTestId('post-body')).toHaveTextContent('p1')

    const comments = screen.getByRole('region', { name: '댓글 2개' })
    expect(await within(comments).findByText('남의 댓글')).toBeInTheDocument()
    // 남의 댓글은 지울 수 없다.
    expect(within(comments).getAllByRole('button', { name: '댓글 지우기' })).toHaveLength(1)

    const submit = within(comments).getByRole('button', { name: '등록' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(comments).getByLabelText('댓글 쓰기'), { target: { value: '  동의합니다  ' } })
    fireEvent.click(submit)
    await waitFor(() => expect(remote.addComment).toHaveBeenCalledWith('p1', '동의합니다'))
    expect(await screen.findByRole('region', { name: '댓글 3개' })).toBeInTheDocument()
  })

  it('좋아요를 누르면 바로 반영하고, 서버가 거절하면 되돌린다', async () => {
    const remote = useRemote({ like: vi.fn().mockRejectedValue(new FeedError('failed')) })
    render(<PostPage author="other" postId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: '좋아요 2개' }))
    expect(screen.getByRole('button', { name: '좋아요 3개' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(remote.like).toHaveBeenCalledWith('p1'))
    expect(await screen.findByRole('button', { name: '좋아요 2개' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('좋아요를 반영하지 못했습니다')
  })

  it('오른쪽에 인기 칼럼과 최근 칼럼을 권한다. 지금 읽는 글과 겹치는 글은 뺀다', async () => {
    useRemote()
    render(<PostPage author="other" postId="p1" />)
    const hot = await screen.findByRole('region', { name: '인기 칼럼' })
    expect(within(hot).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/p/other/p2', '#/p/other/p3'])
    // 좋아요를 받지 않은 글은 인기에 들지 않고 최근 칼럼에 나온다.
    const recent = screen.getByRole('region', { name: '최근 칼럼' })
    expect(within(recent).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/p/other/p4'])
    expect(within(hot).getByText('좋아요 9개 · 댓글 2개')).toBeInTheDocument()
    // 이 글쓴이의 다른 칼럼이 맨 먼저 나온다.
    const own = screen.getByRole('region', { name: '이 글쓴이의 다른 칼럼' })
    expect(within(own).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/p/other/p9'])
  })

  it('글쓴이 카드에서 소개와 숫자를 보고 팔로우한다', async () => {
    const remote = useRemote()
    render(<PostPage author="other" postId="p1" />)
    const card = await screen.findByRole('region', { name: '글쓴이' })
    expect(within(card).getByText('전술 장면을 뜯어봅니다')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /빌드업/ })).toHaveAttribute('href', '#/u/other')
    fireEvent.click(within(card).getByRole('button', { name: '팔로우' }))
    expect(within(card).getByRole('button', { name: '팔로잉' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(remote.follow).toHaveBeenCalledWith('other'))
  })

  it('맨 위 검색창에서 찾으면 그 말을 들고 홈의 피드로 간다', async () => {
    useRemote()
    render(<PostPage author="other" postId="p1" />)
    fireEvent.change(await screen.findByLabelText('칼럼과 칼럼리스트 찾기'), { target: { value: ' 하프스페이스 ' } })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() => expect(window.location.hash).toBe(`#/?q=${encodeURIComponent('하프스페이스')}`))
    expect(parseHash(window.location.hash)).toEqual({ name: 'home', q: '하프스페이스' })
  })

  it('댓글을 최신순으로 바꿔 볼 수 있다', async () => {
    useRemote()
    render(<PostPage author="other" postId="p1" />)
    await screen.findByText('남의 댓글')
    const bodies = () => screen.getAllByRole('listitem').filter((item) => item.className === 'thread').map((item) => item.textContent)
    expect(bodies()[0]).toContain('내 댓글')
    fireEvent.click(screen.getByRole('button', { name: '최신순' }))
    expect(bodies()[0]).toContain('남의 댓글')
  })

  it('로그인하지 않아도 글과 댓글을 읽는다. 좋아요는 로그인 안내로 바뀌고 댓글 쓰는 칸은 없다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    const remote = useRemote()
    render(<PostPage author="other" postId="p1" />)
    expect(await screen.findByText('남의 댓글')).toBeInTheDocument()
    // 댓글을 쓰려면 무엇을 해야 하는지와 그 길(로그인 단추)을 함께 준다.
    expect(screen.getByText(/댓글 쓰기는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    // 맨 위 줄, 가입 안내, 댓글 안내에 같은 이름의 로그인 단추가 있다.
    expect(screen.getAllByRole('button', { name: '로그인 · 가입' }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('region', { name: '축구를 글로 푸는 사람들의 자리' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '등록' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '댓글 지우기' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '좋아요 2개' }))
    expect(screen.getByText(/좋아요는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    expect(remote.like).not.toHaveBeenCalled()
  })

  it('내 글이면 피드에서 내릴 수 있고, 내리면 홈으로 간다', async () => {
    const remote = useRemote({ post: vi.fn().mockResolvedValue(post({ userId: 'me', nickname: '나의 이름' })) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    window.location.hash = '#/p/me/p1'
    render(<PostPage author="me" postId="p1" />)
    // 내리기는 "…" 메뉴 안에 있다.
    fireEvent.click(await screen.findByRole('button', { name: '내 글 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '피드에서 내리기' }))
    await waitFor(() => expect(remote.unpublish).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    confirm.mockRestore()
  })

  it('내 글의 메뉴에서 글 고치기를 누르면, 이 기기에 원본이 없어도 피드의 글로 칼럼을 만들어 글쓰기 화면을 연다', async () => {
    await db.columns.clear()
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '피드에 올라간 본문' }] }] }
    const remote = useRemote({ post: vi.fn().mockResolvedValue(post({ userId: 'me', nickname: '나의 이름', columnId: 'col-9', club: 'liv' })), body: vi.fn().mockResolvedValue(body) })
    window.location.hash = '#/p/me/p1'
    render(<PostPage author="me" postId="p1" />)
    // 남의 글에는 이 메뉴가 없다 (아래 다른 테스트들), 내 글에는 있다.
    fireEvent.click(await screen.findByRole('button', { name: '내 글 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '글 고치기' }))
    await waitFor(() => expect(window.location.hash).toBe('#/write/col-9'))
    expect(remote.body).toHaveBeenCalledWith('p1')
    // 같은 id 의 칼럼이라 다시 올리면 새 글이 아니라 그 글이 바뀐다.
    expect(await db.columns.get('col-9')).toMatchObject({ title: '하프스페이스를 여는 법', feedClub: 'liv', status: 'saved', body })
    expect(window.sessionStorage.getItem('hp:editing-post')).toBe('col-9')
  })

  it('원본 칼럼이 이 기기에 있으면 그것을 그대로 연다 (피드의 글로 덮어쓰지 않는다)', async () => {
    await db.columns.clear()
    await db.columns.put({ id: 'col-9', title: '기기에 있는 원본', body: { type: 'doc', content: [] }, teamId: null, isBest: false, status: 'saved', publishedUrl: '', serverSyncedAt: null, createdAt: 1, updatedAt: 1 })
    const remote = useRemote({ post: vi.fn().mockResolvedValue(post({ userId: 'me', nickname: '나의 이름', columnId: 'col-9' })), body: vi.fn().mockResolvedValue(null) })
    window.location.hash = '#/p/me/p1'
    render(<PostPage author="me" postId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: '내 글 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '글 고치기' }))
    await waitFor(() => expect(window.location.hash).toBe('#/write/col-9'))
    expect((await db.columns.get('col-9'))?.title).toBe('기기에 있는 원본')
    // 글쓰기 화면이 아닌 글 화면에서는 본문을 한 번만 읽는다 (고치기 준비로 다시 읽지 않는다).
    expect(remote.body).not.toHaveBeenCalled()
  })

  it('남의 글에는 내 글 메뉴가 없다', async () => {
    useRemote()
    render(<PostPage author="other" postId="p1" />)
    await screen.findByRole('heading', { name: '하프스페이스를 여는 법', level: 1 })
    expect(screen.queryByRole('button', { name: '내 글 메뉴' })).not.toBeInTheDocument()
  })

  it('프로필 사진의 주소는 정해진 꼴의 위치에서만 만든다', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/')
    const path = '03506aa3-8262-4880-8c39-0eea6ce1cb2c/1791800000000.webp'
    expect(avatarUrl(path)).toBe(`https://example.supabase.co/storage/v1/object/public/avatars/${path}`)
    expect(avatarUrl(null)).toBeNull()
    expect(avatarUrl('../secret.png')).toBeNull()
    expect(avatarUrl('https://evil.example/x.webp')).toBeNull()
    vi.unstubAllEnvs()
  })

  it('글 아래의 단추 줄이 화면에서 벗어나면 같은 단추가 화면 아래에 뜨고, 거기서도 좋아요가 눌린다', async () => {
    // jsdom 에는 IntersectionObserver 가 없다. 지켜보는 쪽이 부른 함수를 붙잡아 두었다가 "화면에서 벗어났다"고 알려 준다.
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          notify = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const remote = useRemote()
    render(<PostPage author="other" postId="p1" />)
    await screen.findByRole('heading', { name: '하프스페이스를 여는 법', level: 1 })
    const floating = screen.getByRole('group', { name: '이 글에 반응하기', hidden: true })
    // 단추 줄이 보이는 동안에는 숨어 있고 누를 수도 없다.
    expect(floating.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('button', { name: '좋아요 2개' })).toHaveLength(1)

    act(() => notify([{ isIntersecting: false }]))
    expect(floating.parentElement).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(within(floating).getByRole('button', { name: '좋아요 2개' }))
    await waitFor(() => expect(remote.like).toHaveBeenCalledWith('p1'))
    // 두 곳의 숫자가 함께 바뀐다.
    expect(screen.getAllByRole('button', { name: '좋아요 3개' })).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('없는 글이면 그 사실을 알리고 피드로 돌아가는 길을 준다', async () => {
    useRemote({ post: vi.fn().mockResolvedValue(null) })
    render(<PostPage author="other" postId="gone" />)
    expect(await screen.findByRole('heading', { name: '글을 찾을 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드로 돌아가기' })).toHaveAttribute('href', '#/')
  })
})

describe('답글과 댓글 좋아요', () => {
  const thread = [
    comment({ id: 'a', nickname: '빌드업', body: '첫 댓글', likeCount: 2 }),
    comment({ id: 'b', userId: 'me', nickname: '나의 이름', body: '첫 댓글의 답글', parentId: 'a' }),
    comment({ id: 'c', userId: 'third', nickname: '세컨드볼', body: '답글의 답글', parentId: 'b' }),
    comment({ id: 'd', userId: '', nickname: '', body: '', deleted: true }),
    comment({ id: 'e', userId: 'third', nickname: '세컨드볼', body: '지워진 댓글에 달린 답글', parentId: 'd' }),
    comment({ id: 'f', userId: 'third', nickname: '세컨드볼', body: '윗댓글이 목록에 없는 답글', parentId: 'gone' }),
  ]

  it('한 줄로 온 댓글을 답글 관계로 엮는다. 최신순은 글에 바로 단 댓글만 뒤집는다', () => {
    const old = buildThreads(thread)
    expect(old.map((node) => node.comment.id)).toEqual(['a', 'd', 'f'])
    expect(old[0].replies.map((node) => node.comment.id)).toEqual(['b'])
    expect(old[0].replies[0].replies.map((node) => node.comment.id)).toEqual(['c'])
    expect(countReplies(old[0])).toBe(2)
    const recent = buildThreads(thread, 'new')
    expect(recent.map((node) => node.comment.id)).toEqual(['f', 'd', 'a'])
    // 답글은 최신순에서도 먼저 쓴 것부터 읽힌다.
    expect(recent[2].replies.map((node) => node.comment.id)).toEqual(['b'])
  })

  it('답글은 윗댓글 아래에 들여 쓰이고, 글쓴이의 댓글에는 표시가 붙고, 지워진 자리는 답글만 남긴다', async () => {
    useRemote({ comments: vi.fn().mockResolvedValue(thread) })
    render(<PostPage author="other" postId="p1" />)
    const first = (await screen.findByText('첫 댓글')).closest('li') as HTMLElement
    expect(within(first).getByText('답글의 답글')).toBeInTheDocument()
    // 이 글을 쓴 사람(other)의 댓글
    expect(within(first).getAllByText('글쓴이')).toHaveLength(1)
    const gone = screen.getByText('글쓴이가 지운 댓글입니다.').closest('li') as HTMLElement
    expect(within(gone).getByText('지워진 댓글에 달린 답글')).toBeInTheDocument()
    // 지워진 자리에는 좋아요와 답글 달기가 없다 (그 아래 답글의 것만 있다).
    expect(within(gone).getAllByRole('button', { name: '답글 달기' })).toHaveLength(1)
  })

  it('답글 달기를 누르면 그 댓글 아래에 쓰는 칸이 열리고, 윗댓글을 알려 서버에 보낸다', async () => {
    const remote = useRemote({ comments: vi.fn().mockResolvedValue(thread) })
    render(<PostPage author="other" postId="p1" />)
    const first = (await screen.findByText('첫 댓글')).closest('li') as HTMLElement
    fireEvent.click(within(first).getAllByRole('button', { name: '답글 달기' })[0])
    const input = screen.getByLabelText('빌드업 님에게 답글 쓰기')
    fireEvent.change(input, { target: { value: ' 동의합니다 ' } })
    fireEvent.click(screen.getByRole('button', { name: '답글' }))
    await waitFor(() => expect(remote.addComment).toHaveBeenCalledWith('p1', '동의합니다', 'a'))
    await waitFor(() => expect(screen.queryByLabelText('빌드업 님에게 답글 쓰기')).not.toBeInTheDocument())
  })

  it('댓글 좋아요는 바로 반영하고, 서버가 거절하면 되돌린다', async () => {
    const remote = useRemote({ comments: vi.fn().mockResolvedValue(thread), likeComment: vi.fn().mockRejectedValue(new FeedError('failed')) })
    render(<PostPage author="other" postId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: '빌드업 님의 댓글 좋아요 2개' }))
    expect(screen.getByRole('button', { name: '빌드업 님의 댓글 좋아요 3개' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(remote.likeComment).toHaveBeenCalledWith('a'))
    expect(await screen.findByRole('button', { name: '빌드업 님의 댓글 좋아요 2개' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('답글을 접으면 몇 개가 접혔는지 알리고, 다시 펼 수 있다', async () => {
    useRemote({ comments: vi.fn().mockResolvedValue(thread) })
    render(<PostPage author="other" postId="p1" />)
    await screen.findByText('답글의 답글')
    fireEvent.click(screen.getAllByRole('button', { name: '답글 2개 접기' })[0])
    expect(screen.queryByText('답글의 답글')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '답글 2개 더 보기' }))
    expect(screen.getByText('답글의 답글')).toBeInTheDocument()
  })

  it('답글이 달린 내 댓글을 지우면 자리가 남으므로 댓글 수는 그대로다', async () => {
    const remote = useRemote({ comments: vi.fn().mockResolvedValue(thread), removeComment: vi.fn().mockResolvedValue(false) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PostPage author="other" postId="p1" />)
    await screen.findByText('첫 댓글의 답글')
    fireEvent.click(screen.getByRole('button', { name: '댓글 지우기' }))
    await waitFor(() => expect(remote.removeComment).toHaveBeenCalledWith('b'))
    expect(confirm.mock.calls[0][0]).toContain('자리는 남습니다')
    expect(screen.getByRole('region', { name: '댓글 2개' })).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('로그인하지 않고 댓글 좋아요나 답글 달기를 누르면 로그인 안내가 뜬다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    const remote = useRemote({ comments: vi.fn().mockResolvedValue(thread) })
    render(<PostPage author="other" postId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: '빌드업 님의 댓글 좋아요 2개' }))
    expect(screen.getByText(/댓글 좋아요는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '답글 달기' })[0])
    expect(screen.getByText(/답글 쓰기는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    expect(remote.likeComment).not.toHaveBeenCalled()
  })
})
