import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountBar } from './AccountBar'
import { loadQuota } from './usage'
import { AccountError, agree, deleteAccount, signIn, signOut, useAccount, type Account } from './session'

// 서버 연결은 가짜로 바꾼다. 실제 로그인은 Supabase 프로젝트를 연결한 뒤 브라우저에서 확인한다.
vi.mock('./usage', async (original) => ({ ...(await original<typeof import('./usage')>()), loadQuota: vi.fn() }))

vi.mock('./session', async (original) => ({
  ...(await original<typeof import('./session')>()),
  useAccount: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  agree: vi.fn(),
  deleteAccount: vi.fn(),
}))

const signedIn = (patch: Partial<Extract<Account, { status: 'in' }>> = {}): Account => ({
  status: 'in',
  userId: 'u1',
  email: 'writer@example.com',
  accessToken: 't',
  profile: { nickname: '칼럼니스트' },
  serverDown: false,
  ...patch,
})

const show = (account: Account) => {
  vi.mocked(useAccount).mockReturnValue(account)
  return render(<AccountBar />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(signIn).mockResolvedValue()
  vi.mocked(signOut).mockResolvedValue()
  vi.mocked(agree).mockResolvedValue()
  vi.mocked(deleteAccount).mockResolvedValue()
  vi.mocked(loadQuota).mockResolvedValue({ drafts: 2, statCallsToday: 21 })
})

describe('계정 영역', () => {
  it('서버 설정이 없으면 아무것도 보여 주지 않는다', () => {
    const { container } = show({ status: 'off' })
    expect(container).toBeEmptyDOMElement()
  })

  it('확인하는 동안에는 그 사실을 보여 준다', () => {
    show({ status: 'loading' })
    expect(screen.getByText('계정을 확인하는 중…')).toBeInTheDocument()
  })

  it('로그인하지 않았으면 Google 로그인 버튼을 보여 준다 (A-1)', () => {
    show({ status: 'out' })
    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }))
    expect(signIn).toHaveBeenCalled()
    expect(screen.getByText(/로그인하지 않아도 글은 이 기기에 저장됩니다/)).toBeInTheDocument()
  })

  it('처음 온 사용자는 약관에 동의해야 시작할 수 있다 (A-5)', async () => {
    show(signedIn({ profile: null }))
    const start = screen.getByRole('button', { name: '시작하기' })
    expect(start).toBeDisabled()
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '#/terms')
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', '#/privacy')
    // 가입 연령 (APP-PRD 15장: 만 14세 이상, 가입 동의 항목으로 확인)
    expect(screen.getByRole('checkbox', { name: '만 14세 이상이며, 이용약관과 개인정보처리방침에 동의합니다.' })).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('닉네임 (선택)'), { target: { value: '칼럼니스트' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(start)
    await waitFor(() => expect(agree).toHaveBeenCalledWith('칼럼니스트'))
  })

  it('가입 인원이 가득 찼으면 그 사실을 알린다 (A-7)', async () => {
    vi.mocked(agree).mockRejectedValue(new AccountError('closed'))
    show(signedIn({ profile: null }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('가입 인원이 가득 찼습니다')
  })

  it('닉네임에 쓸 수 없는 말이 있으면 그 사실을 알린다', async () => {
    vi.mocked(agree).mockRejectedValue(new AccountError('banned'))
    show(signedIn({ profile: null }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('닉네임에 쓸 수 없는 말이 들어 있습니다')
  })

  it('로그인한 사용자는 닉네임과 로그아웃·탈퇴를 본다', () => {
    show(signedIn())
    expect(screen.getByText('칼럼니스트')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('내 할당량을 보여 준다 (A-4)', async () => {
    show(signedIn())
    expect(await screen.findByText('서버 초안 2/3편 · 오늘 스탯 조회 21/300회')).toBeInTheDocument()
  })

  it('약관에 동의하기 전에는 할당량을 묻지 않는다', () => {
    show(signedIn({ profile: null }))
    expect(loadQuota).not.toHaveBeenCalled()
  })

  it('탈퇴는 확인을 받은 뒤에만 진행한다 (A-3)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    show(signedIn())
    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    expect(deleteAccount).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    await waitFor(() => expect(deleteAccount).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toContain('이 기기에 저장한 칼럼은 그대로 남습니다')
    confirm.mockRestore()
  })

  it('서버에 닿지 못하면 기기 저장으로 계속 쓸 수 있음을 알린다 (SB-9)', () => {
    show(signedIn({ profile: undefined, serverDown: true }))
    expect(screen.getByText(/서버 점검 중 — 글은 이 기기에 저장됩니다/)).toBeInTheDocument()
  })
})
