import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))

const rpc = vi.fn()
const select = vi.fn()
const server = {
  rpc,
  from: () => ({ select: (columns: string) => ({ eq: () => ({ maybeSingle: () => select(columns) }) }) }),
  // 시작하자마자 u1 로 로그인돼 있다.
  auth: { onAuthStateChange: (listener: (event: string, session: unknown) => void) => listener('INITIAL_SESSION', { user: { id: 'u1', email: 'a@b.c' }, access_token: 't' }) },
}

// session 은 로그인 상태를 모듈 안에 들고 있으므로 테스트마다 새로 읽는다.
const start = async () => {
  vi.resetModules()
  const { getServer } = await import('../../lib/supabase')
  vi.mocked(getServer).mockReturnValue(Promise.resolve(server) as never)
  const session = await import('./session')
  session.startAccount()
  await vi.waitFor(() => {
    const account = session.getAccount()
    if (account.status !== 'in' || (account.profile === undefined && !account.serverDown)) throw new Error('아직 읽는 중')
  })
  return session.getAccount()
}

beforeEach(() => {
  rpc.mockReset()
  select.mockReset()
})

describe('내 프로필 읽기 (보안 점검 L1)', () => {
  it('표를 직접 읽지 않고 my_profile() 로 읽으며, 이용 정지 여부도 담아 둔다', async () => {
    rpc.mockResolvedValue({ data: [{ nickname: '칼럼니스트', avatar: 'u1/1.webp', bio: '소개', club: null, suspended: true }], error: null })
    const account = await start()
    expect(rpc).toHaveBeenCalledWith('my_profile')
    expect(select).not.toHaveBeenCalled()
    expect(account).toMatchObject({ status: 'in', serverDown: false, profile: { nickname: '칼럼니스트', avatar: 'u1/1.webp', suspended: true } })
  })

  it('아직 가입하지 않았으면(행이 없음) 약관 동의 전으로 본다', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await start()).toMatchObject({ status: 'in', profile: null })
  })

  it('함수가 없는 예전 서버에서는 지금처럼 표에서 읽는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    select.mockImplementation(async (columns: string) => (columns === 'nickname' ? { data: { nickname: '옛 서버' }, error: null } : { data: null, error: { code: '42703', message: 'column' } }))
    const account = await start()
    expect(select).toHaveBeenLastCalledWith('nickname')
    expect(account).toMatchObject({ status: 'in', profile: { nickname: '옛 서버', avatar: null, suspended: false } })
  })

  it('그 밖의 오류면 서버 점검으로 보고 표를 읽지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'down' } })
    expect(await start()).toMatchObject({ status: 'in', profile: undefined, serverDown: true })
    expect(select).not.toHaveBeenCalled()
  })
})
