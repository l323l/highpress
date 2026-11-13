import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseHash, toHash } from '../../lib/router'
import { useAccount, type Account } from '../account/session'
import { FeedError, type FeedPost, type FeedProfile, type FeedRemote } from '@highpress/core/feed'
import { getFeedRemote } from '../feed/remote'
import { ProfilePage } from './ProfilePage'

// 서버 호출은 가짜로 바꾼다. 실제 동작은 Supabase에 0004_social.sql을 넣은 뒤 브라우저에서 확인한다.
vi.mock('../account/session', async (original) => ({ ...(await original<typeof import('../account/session')>()), useAccount: vi.fn() }))
vi.mock('../feed/remote', async (original) => ({ ...(await original<typeof import('../feed/remote')>()), getFeedRemote: vi.fn() }))

const signedIn: Account = { status: 'in', userId: 'me', email: 'me@example.com', accessToken: 't', profile: { nickname: '나의 이름' }, serverDown: false }

const profile = (patch: Partial<FeedProfile> = {}): FeedProfile => ({
  userId: 'other',
  nickname: '빌드업',
  bio: '전환 국면을 주로 씁니다',
  club: 'ars',
  lastSeenAt: null,
  postCount: 3,
  followerCount: 12,
  followingCount: 4,
  likeCount: 40,
  following: false,
  fresh: true,
  avatar: null,
  ...patch,
})

const post: FeedPost = {
  id: 'p1',
  userId: 'other',
  nickname: '빌드업',
  columnId: 'c1',
  title: '하프스페이스를 여는 법',
  excerpt: '풀백이 안으로 들어오면 생기는 일',
  createdAt: Date.now() - 5 * 60_000,
  likeCount: 2,
  commentCount: 0,
  liked: false,
  club: 'ars',
  cover: null,
  avatar: null,
}

function useRemote(patch: Partial<FeedRemote> = {}): FeedRemote {
  const remote = {
    page: vi.fn().mockResolvedValue([post]),
    profile: vi.fn().mockResolvedValue(profile()),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    ...patch,
  } as unknown as FeedRemote
  vi.mocked(getFeedRemote).mockResolvedValue(remote)
  return remote
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(signedIn)
})

describe('프로필 주소', () => {
  it('#/u/아이디 로 오간다', () => {
    expect(parseHash('#/u/0f3a-12')).toEqual({ name: 'profile', id: '0f3a-12' })
    expect(toHash({ name: 'profile', id: '0f3a-12' })).toBe('#/u/0f3a-12')
    expect(parseHash('#/u/')).toEqual({ name: 'home' })
  })
})

describe('프로필 화면', () => {
  it('로그인하지 않아도 프로필과 글을 읽는다. 접속 여부는 보이지 않고, 팔로우는 로그인 안내로 바뀐다', async () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    const remote = useRemote()
    render(<ProfilePage userId="other" />)
    expect(await screen.findByRole('heading', { name: '빌드업', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '하프스페이스를 여는 법' })).toBeInTheDocument()
    expect(screen.queryByText(/접속 중|자리에 없음/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '팔로우' }))
    expect(screen.getByText(/팔로우는 로그인한 뒤에 할 수 있습니다/)).toBeInTheDocument()
    expect(remote.follow).not.toHaveBeenCalled()
  })

  it('소개·응원 구단·숫자와 그 사람의 칼럼을 보여 준다', async () => {
    const remote = useRemote()
    render(<ProfilePage userId="other" />)
    expect(await screen.findByRole('heading', { level: 1, name: '빌드업' })).toBeInTheDocument()
    const head = within(screen.getByRole('region', { name: '프로필' }))
    expect(head.getByText('전환 국면을 주로 씁니다')).toBeInTheDocument()
    expect(head.getByText('아스널')).toBeInTheDocument()
    expect(head.getByText('12')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '하프스페이스를 여는 법' })).toBeInTheDocument()
    expect(remote.page).toHaveBeenCalledWith({ before: undefined, author: 'other', club: null, clubs: null, following: false, query: '', sort: 'new' })
  })

  it('팔로우를 누르면 바로 반영하고 서버에 보낸다', async () => {
    const remote = useRemote()
    render(<ProfilePage userId="other" />)
    fireEvent.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(screen.getByRole('button', { name: '팔로잉' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('13')).toBeInTheDocument()
    await waitFor(() => expect(remote.follow).toHaveBeenCalledWith('other'))

    await waitFor(() => expect(screen.getByRole('button', { name: '팔로잉' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '팔로잉' }))
    await waitFor(() => expect(remote.unfollow).toHaveBeenCalledWith('other'))
    expect(screen.getByRole('button', { name: '팔로우' })).toBeInTheDocument()
  })

  it('서버가 거절하면 팔로우를 되돌리고 알린다', async () => {
    useRemote({ follow: vi.fn().mockRejectedValue(new FeedError('quota')) })
    render(<ProfilePage userId="other" />)
    fireEvent.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('200명까지')
    expect(screen.getByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('내 프로필에는 팔로우 대신 고치기가 있고, 소개와 응원 구단을 저장한다', async () => {
    const remote = useRemote({ profile: vi.fn().mockResolvedValue(profile({ userId: 'me', nickname: '나의 이름', bio: '', club: null })) })
    render(<ProfilePage userId="me" />)
    fireEvent.click(await screen.findByRole('button', { name: '프로필 고치기' }))
    expect(screen.queryByRole('button', { name: '팔로우' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '  세트피스 이야기  ' } })
    fireEvent.change(screen.getByLabelText('응원 구단'), { target: { value: 'bvb' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(remote.saveProfile).toHaveBeenCalledWith('me', { bio: '세트피스 이야기', club: 'bvb' }))
    expect(await screen.findByText('세트피스 이야기')).toBeInTheDocument()
    expect(screen.getByText('도르트문트')).toBeInTheDocument()
  })

  it('없는 사람이면 그 사실을 알린다', async () => {
    useRemote({ profile: vi.fn().mockResolvedValue(null), page: vi.fn().mockResolvedValue([]) })
    render(<ProfilePage userId="nobody" />)
    expect(await screen.findByRole('heading', { name: '프로필을 찾을 수 없습니다' })).toBeInTheDocument()
  })
})
