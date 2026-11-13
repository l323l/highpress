import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { createColumn, putMedia } from '../../db/store'
import { getServer } from '../../lib/supabase'
import { parseCafeBoard, recentTargets, rememberTarget } from './cafeTarget'
import { NaverPostError, naverPostErrorText } from '@highpress/core/naver'
import { postToCafe } from './naverPost'

vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))

const invoke = vi.fn()
const sameBlob = (source: Blob) => Promise.resolve(source)

beforeEach(async () => {
  await db.settings.clear()
  invoke.mockReset()
  vi.mocked(getServer).mockResolvedValue({ functions: { invoke } } as never)
})

describe('게시판 주소 읽기', () => {
  it('새 주소와 옛 주소에서 카페 고유번호와 게시판 번호를 읽는다', () => {
    expect(parseCafeBoard('https://cafe.naver.com/f-e/cafes/31802525/menus/1?viewType=L')).toEqual({ clubId: '31802525', menuId: '1' })
    expect(parseCafeBoard(' https://cafe.naver.com/ArticleList.nhn?search.clubid=31802525&search.menuid=7&search.boardtype=L ')).toEqual({ clubId: '31802525', menuId: '7' })
    expect(parseCafeBoard('https://m.cafe.naver.com/ca-fe/web/cafes/123/menus/45')).toEqual({ clubId: '123', menuId: '45' })
  })

  it('네이버 카페가 아니거나 번호가 없는 주소는 받지 않는다', () => {
    expect(parseCafeBoard('https://cafe.naver.com/greenap4bq')).toBeNull()
    expect(parseCafeBoard('https://evil.example/cafes/1/menus/2')).toBeNull()
    expect(parseCafeBoard('https://cafe.naver.com/f-e/cafes/abc/menus/1')).toBeNull()
    expect(parseCafeBoard('31802525')).toBeNull()
  })

  it('올렸던 곳을 최근 순으로 다섯 곳까지 기억하고, 같은 곳은 한 번만 둔다', async () => {
    for (let menu = 1; menu <= 6; menu++) await rememberTarget({ clubId: '10', menuId: String(menu), label: `게시판 ${menu}` })
    await rememberTarget({ clubId: '10', menuId: '4', label: '다시 올린 곳' })
    const targets = await recentTargets()
    expect(targets.map((target) => target.menuId)).toEqual(['4', '6', '5', '3', '2'])
    expect(targets[0].label).toBe('다시 올린 곳')
  })
})

describe('네이버 카페에 올리기', () => {
  const input = async (html: string, title = '압박의 출발점') => {
    const column = await createColumn()
    return { columnId: column.id, html, title, target: { clubId: '31802525', menuId: '1' }, token: 'naver-token-123' }
  }

  it('글과 사진을 함께 보내고, 사진 자리에는 옮길 곳을 글자로 남긴다', async () => {
    const column = await createColumn()
    const photo = await putMedia({ columnId: column.id, kind: 'image', temp: false, blob: new Blob(['a'], { type: 'image/png' }), name: '첫째.png' })
    const clip = await putMedia({ columnId: column.id, kind: 'video', temp: false, blob: new Blob(['v'], { type: 'video/mp4' }), name: '영상.mp4' })
    invoke.mockResolvedValue({ data: { url: 'https://cafe.naver.com/greenap4bq/12' }, error: null })
    const shrink = vi.fn().mockResolvedValue(new Blob(['작게'], { type: 'image/jpeg' }))
    const html = `<p>본문</p><img data-media-id="${photo.id}"><img data-media-id="${clip.id}">`

    const url = await postToCafe({ columnId: column.id, html, title: '  압박의 출발점  ', target: { clubId: '31802525', menuId: '1' }, token: 'naver-token-123' }, shrink)
    expect(url).toBe('https://cafe.naver.com/greenap4bq/12')
    expect(shrink).toHaveBeenCalledTimes(1)

    const [name, options] = invoke.mock.calls[0] as [string, { body: FormData }]
    expect(name).toBe('naver')
    expect(options.body.get('subject')).toBe('압박의 출발점')
    expect(options.body.get('clubId')).toBe('31802525')
    expect(options.body.get('menuId')).toBe('1')
    const content = String(options.body.get('content'))
    expect(content).toContain('[사진 1 — 글 맨 위의 1번째 사진을 여기로 옮기세요]')
    // 영상은 올라가지 않는다. 앱 내부용 표시도 내보내지 않는다.
    expect(options.body.getAll('image')).toHaveLength(1)
    expect(content).not.toContain('data-media-id')
  })

  it('제목이 없으면 올리지 않는다', async () => {
    await expect(postToCafe(await input('<p>본문</p>', '   '), sameBlob)).rejects.toMatchObject({ problem: 'no-title' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('서버 함수가 알려 준 거절 이유를 가려 알린다', async () => {
    const refuse = (status: number, body: unknown) => invoke.mockResolvedValueOnce({ data: null, error: { context: { status, json: () => Promise.resolve(body) } } })

    refuse(429, { error: 'too-fast', detail: '게시글을 연속으로 등록할 수 없습니다.' })
    const fast = await postToCafe(await input('<p>본문</p>'), sameBlob).catch((cause: unknown) => cause)
    expect(fast).toMatchObject({ problem: 'too-fast' })
    expect(naverPostErrorText(fast)).toContain('연달아 올릴 수 없습니다')

    refuse(401, { error: 'naver-login', detail: '' })
    await expect(postToCafe(await input('<p>본문</p>'), sameBlob)).rejects.toMatchObject({ problem: 'login' })

    refuse(502, { error: 'failed', detail: '오류가 발생하였습니다.' })
    const failed = await postToCafe(await input('<p>본문</p>'), sameBlob).catch((cause: unknown) => cause)
    expect(failed).toBeInstanceOf(NaverPostError)
    expect(naverPostErrorText(failed)).toContain('네이버: 오류가 발생하였습니다.')

    refuse(404, null)
    await expect(postToCafe(await input('<p>본문</p>'), sameBlob)).rejects.toMatchObject({ problem: 'off' })
  })

  it('네이버 카페 주소가 아닌 응답은 성공으로 보지 않는다', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://evil.example/1' }, error: null })
    await expect(postToCafe(await input('<p>본문</p>'), sameBlob)).rejects.toMatchObject({ problem: 'failed' })
  })
})
