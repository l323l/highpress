import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServer } from '../../lib/supabase'
import { NAVER_VERIFIER_KEY, NaverAuthError, requestNaverCode } from '../naver/naverAuth'
import { LoginDialog } from './LoginDialog'
import { closeLogin, openLogin } from './loginPrompt'
import { AccountError, accountLabel, NAVER_ACCOUNT_SUFFIX, signInWithNaver, startAccount } from './session'

// 서버와 네이버 로그인 창은 가짜로 바꾼다. 실제 네이버 로그인은 배포한 뒤 브라우저에서 확인한다.
vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))
vi.mock('../naver/naverAuth', async (original) => ({
  ...(await original<typeof import('../naver/naverAuth')>()),
  requestNaverCode: vi.fn(),
  naverReady: () => true,
}))

const invoke = vi.fn()
// 32바이트를 base64url 로 적은 43자
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const verifyOtp = vi.fn()
const server = {
  functions: { invoke },
  // 로그인하지 않은 상태로 시작한다.
  auth: { verifyOtp, onAuthStateChange: (listener: (event: string, session: null) => void) => listener('INITIAL_SESSION', null) },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServer).mockReturnValue(Promise.resolve(server) as never)
  vi.mocked(requestNaverCode).mockResolvedValue({ code: 'code-1', state: 'state-12345', verifier: VERIFIER })
  invoke.mockResolvedValue({ data: { tokenHash: 'hash-1' }, error: null })
  verifyOtp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
  closeLogin()
})

describe('네이버로 가입 · 로그인 (A-10)', () => {
  it('네이버 로그인 창에서 받은 코드를 서버 함수에 보내고, 받은 표로 로그인한다', async () => {
    await signInWithNaver()
    expect(invoke).toHaveBeenCalledWith('naver-login', { body: { code: 'code-1', state: 'state-12345', verifier: VERIFIER } })
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' })
  })

  it('표의 종류를 예전 이름으로만 받는 서버에서는 한 번 더 시도한다', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'otp' } })
    await signInWithNaver()
    expect(verifyOtp).toHaveBeenLastCalledWith({ token_hash: 'hash-1', type: 'magiclink' })
  })

  it('서버 함수가 표를 주지 않으면 실패로 알린다', async () => {
    invoke.mockResolvedValue({ data: { error: 'naver-login' }, error: { message: '502' } })
    await expect(signInWithNaver()).rejects.toBeInstanceOf(AccountError)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('로그인 창을 닫으면 서버로 아무것도 보내지 않는다', async () => {
    vi.mocked(requestNaverCode).mockRejectedValue(new NaverAuthError('cancelled'))
    await expect(signInWithNaver()).rejects.toBeInstanceOf(NaverAuthError)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('verifier 를 함께 보낸 뒤 이 탭의 저장소에서 지운다 (A1-6)', async () => {
    window.sessionStorage.setItem(NAVER_VERIFIER_KEY, VERIFIER)
    await signInWithNaver()
    expect(invoke.mock.calls[0][1].body.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })

  it('서버가 verifier 를 거절해도 저장소의 verifier 는 지우고, 그 이유를 알린다', async () => {
    window.sessionStorage.setItem(NAVER_VERIFIER_KEY, VERIFIER)
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'bad-verifier' }), { status: 400 }) } })
    await expect(signInWithNaver()).rejects.toMatchObject({ code: 'verifier' })
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('너무 자주 시도해 서버가 429 를 주면 rate 로 알린다', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'rate' }), { status: 429 }) } })
    await expect(signInWithNaver()).rejects.toMatchObject({ code: 'rate' })
    // 본문을 읽지 못해도 상태 번호로 가린다.
    invoke.mockResolvedValue({ data: null, error: { context: new Response('busy', { status: 429 }) } })
    await expect(signInWithNaver()).rejects.toMatchObject({ code: 'rate' })
  })

  it('네이버로 가입한 계정은 주소 대신 "네이버 계정"이라고 적는다', () => {
    expect(accountLabel(`n0123${NAVER_ACCOUNT_SUFFIX}`)).toBe('네이버 계정')
    expect(accountLabel('writer@example.com')).toBe('writer@example.com')
  })
})

describe('로그인 방법 고르기 창', () => {
  const show = async () => {
    startAccount()
    render(<LoginDialog />)
    act(() => openLogin())
    return screen.findByRole('dialog', { name: '로그인 · 가입' })
  }

  it('Google 과 네이버 두 가지를 보여 주고, Esc 로 닫힌다', async () => {
    const dialog = await show()
    expect(screen.getByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '네이버로 로그인' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('서로 다른 계정으로 가입됩니다')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('네이버 단추를 누르면 네이버 로그인을 시작한다', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: '네이버로 로그인' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('naver-login', { body: { code: 'code-1', state: 'state-12345', verifier: VERIFIER } }))
  })

  it('팝업이 막혔으면 어떻게 하면 되는지 알려 준다', async () => {
    vi.mocked(requestNaverCode).mockRejectedValue(new NaverAuthError('popup'))
    await show()
    fireEvent.click(screen.getByRole('button', { name: '네이버로 로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('팝업을 허용한 뒤 다시 눌러 주세요')
  })

  it('verifier 가 맞지 않거나 너무 자주 시도하면 그에 맞게 알린다', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'bad-verifier' }), { status: 400 }) } })
    await show()
    fireEvent.click(screen.getByRole('button', { name: '네이버로 로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('처음부터 다시 눌러 주세요')

    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'rate' }), { status: 429 }) } })
    fireEvent.click(screen.getByRole('button', { name: '네이버로 로그인' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('10분쯤 뒤에 다시 눌러 주세요'))
  })
})
