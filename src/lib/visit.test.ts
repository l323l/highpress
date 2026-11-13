import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServer } from './supabase'
import { countVisit, seoulDay, VISIT_KEY } from './visit'

vi.mock('./supabase', () => ({ getServer: vi.fn() }))

const rpc = vi.fn()
const serve = () => vi.mocked(getServer).mockReturnValue(Promise.resolve({ rpc } as never))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  rpc.mockResolvedValue({ data: '2026-10-16', error: null })
})

describe('하루 방문자 세기', () => {
  it('날짜는 한국 시간으로 정한다', () => {
    // UTC 15:30 은 한국의 다음 날 0:30
    expect(seoulDay(new Date('2026-10-15T15:30:00Z'))).toBe('2026-10-16')
    expect(seoulDay(new Date('2026-10-15T14:59:00Z'))).toBe('2026-10-15')
  })

  it('하루에 한 번만 서버에 알리고, 아무 값도 넘기지 않는다', async () => {
    serve()
    const now = new Date('2026-10-16T03:00:00Z')
    expect(await countVisit(now)).toBe(true)
    expect(await countVisit(now)).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('count_visit')
    expect(window.localStorage.getItem(VISIT_KEY)).toBe('2026-10-16')
  })

  it('날짜가 바뀌면 다시 센다', async () => {
    serve()
    await countVisit(new Date('2026-10-16T03:00:00Z'))
    expect(await countVisit(new Date('2026-10-16T15:10:00Z'))).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('서버 설정이 없으면 부르지 않는다', async () => {
    vi.mocked(getServer).mockReturnValue(null)
    expect(await countVisit()).toBe(false)
    expect(window.localStorage.getItem(VISIT_KEY)).toBeNull()
  })

  it('서버에 함수가 아직 없어도 그날은 다시 부르지 않는다', async () => {
    serve()
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    const now = new Date('2026-10-16T03:00:00Z')
    expect(await countVisit(now)).toBe(false)
    expect(await countVisit(now)).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('기기 저장을 막아 둔 브라우저는 세지 않는다 (열 때마다 부풀지 않게)', async () => {
    serve()
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(await countVisit()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
