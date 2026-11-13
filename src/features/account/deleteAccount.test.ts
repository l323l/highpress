import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServer } from '../../lib/supabase'
import { AccountError, deleteAccount } from './session'

vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))

const invoke = vi.fn()
const signOut = vi.fn()
const rpc = vi.fn()
const storageFrom = vi.fn()
const server = { functions: { invoke }, auth: { signOut }, rpc, storage: { from: storageFrom } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServer).mockReturnValue(Promise.resolve(server) as never)
  invoke.mockResolvedValue({ data: { ok: true }, error: null })
  signOut.mockResolvedValue({ error: null })
})

describe('회원 탈퇴 (A1-7)', () => {
  it('서버 함수 account-delete 하나로 지우고, 끝나면 이 기기에서 로그아웃한다', async () => {
    await deleteAccount()
    expect(invoke).toHaveBeenCalledWith('account-delete', expect.objectContaining({ method: 'POST' }))
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    // 사진은 서버 함수가 지운다. 앱이 보관함이나 예전 함수를 직접 부르지 않는다.
    expect(storageFrom).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('서버 함수가 실패하면 failed 로 알리고 로그아웃하지 않는다', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response('{"error":"delete"}', { status: 500 }) } })
    await expect(deleteAccount()).rejects.toEqual(new AccountError('failed'))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('응답이 { ok: true } 가 아니면 지워졌다고 보지 않는다', async () => {
    invoke.mockResolvedValue({ data: { error: 'auth' }, error: null })
    await expect(deleteAccount()).rejects.toBeInstanceOf(AccountError)
    expect(signOut).not.toHaveBeenCalled()
  })
})
