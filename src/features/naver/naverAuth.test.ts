import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getServer } from '../../lib/supabase'
import { forgetNaver, forgetNaverVerifier, loginNaver, makeVerifier, NAVER_CHANNEL, NAVER_VERIFIER_KEY, NaverAuthError, requestNaverCode, stateFor } from './naverAuth'

vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))

// 로그인 창(팝업)과 창끼리 주고받는 통로는 가짜로 바꾼다.
class FakeChannel {
  static open: FakeChannel[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  readonly name: string
  constructor(name: string) {
    this.name = name
    FakeChannel.open.push(this)
  }
  close() {
    FakeChannel.open = FakeChannel.open.filter((channel) => channel !== this)
  }
}

const say = (data: unknown) => {
  for (const channel of FakeChannel.open.filter((one) => one.name === NAVER_CHANNEL)) channel.onmessage?.({ data } as MessageEvent)
}

// 팝업 주소에 state 가 실릴 때까지 기다린다 (SHA-256 계산 뒤에 주소를 넣는다).
const stateIn = async (popup: { location: { href: string } }) => {
  await vi.waitFor(() => expect(popup.location.href).toContain('state='))
  return new URL(popup.location.href).searchParams.get('state') ?? ''
}

let popup: { closed: boolean; location: { href: string }; close: () => void }

beforeEach(() => {
  FakeChannel.open = []
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  popup = { closed: false, location: { href: '' }, close: vi.fn(() => (popup.closed = true)) }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  window.sessionStorage.clear()
})

afterEach(() => {
  forgetNaverVerifier()
  forgetNaver()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('네이버 로그인 verifier (A1-6)', () => {
  it('verifier 는 32바이트 무작위 값을 base64url 로 적은 43자다', () => {
    const one = makeVerifier()
    expect(one).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(makeVerifier()).not.toBe(one)
  })

  it('state 는 base64url(SHA-256(verifier)) 다 (RFC 7636 부록 B의 값)', async () => {
    expect(await stateFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('창을 먼저 열고, 돌아올 때까지 verifier 를 이 탭의 저장소에 둔 뒤 코드와 함께 돌려준다', async () => {
    const asked = requestNaverCode()
    // 기다림 없이 창부터 연다 (팝업이 막히지 않게).
    expect(window.open).toHaveBeenCalledWith('', 'hp-naver-login', expect.any(String))
    const state = await stateIn(popup)
    const kept = window.sessionStorage.getItem(NAVER_VERIFIER_KEY)
    expect(kept).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await stateFor(kept ?? '')).toBe(state)
    expect(popup.location.href).toMatch(/^https:\/\/nid\.naver\.com\/oauth2\.0\/authorize\?/)

    say({ state, code: 'code-1', error: '' })
    await expect(asked).resolves.toEqual({ code: 'code-1', state, verifier: kept })
  })

  it('다른 요청의 응답(state 가 다름)은 받지 않고 verifier 를 지운다', async () => {
    const asked = requestNaverCode()
    await stateIn(popup)
    say({ state: 'someone-else', code: 'code-1', error: '' })
    await expect(asked).rejects.toEqual(new NaverAuthError('state'))
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })

  it('네이버에서 동의하지 않으면 취소로 보고 verifier 를 지운다', async () => {
    const asked = requestNaverCode()
    const state = await stateIn(popup)
    say({ state, code: '', error: 'access_denied' })
    await expect(asked).rejects.toEqual(new NaverAuthError('cancelled'))
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })

  it('카페 올리기도 verifier 를 naver 함수에 함께 보내고, 보낸 뒤 지운다 (보안 점검 M1)', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { token: 'naver-token', expiresIn: 3600 }, error: null })
    vi.mocked(getServer).mockReturnValue(Promise.resolve({ functions: { invoke } }) as never)
    const asked = loginNaver()
    const state = await stateIn(popup)
    const kept = window.sessionStorage.getItem(NAVER_VERIFIER_KEY)
    say({ state, code: 'code-1', error: '' })
    await expect(asked).resolves.toBe('naver-token')
    expect(invoke).toHaveBeenCalledWith('naver', { body: { code: 'code-1', state, verifier: kept } })
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })

  it('카페 올리기에서 서버가 verifier 를 거절하면 실패로 알리고 verifier 를 지운다', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: new Response('{"error":"bad-verifier"}', { status: 400 }) } })
    vi.mocked(getServer).mockReturnValue(Promise.resolve({ functions: { invoke } }) as never)
    const asked = loginNaver()
    say({ state: await stateIn(popup), code: 'code-1', error: '' })
    await expect(asked).rejects.toEqual(new NaverAuthError('failed'))
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })

  it('팝업이 막히면 verifier 를 만들지 않는다', async () => {
    vi.mocked(window.open).mockReturnValue(null)
    await expect(requestNaverCode()).rejects.toEqual(new NaverAuthError('popup'))
    expect(window.sessionStorage.getItem(NAVER_VERIFIER_KEY)).toBeNull()
  })
})
