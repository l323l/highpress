import type { JSONContent } from '@tiptap/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { createColumn, deleteColumn, getSetting, updateColumn } from '../../db/store'
import { SYNC_DELETED_KEY } from '@highpress/core/db'
import { createSyncEngine, isBlank, pullDrafts, pushChanges, QuotaError, type DraftRemote, type RemoteDraft, type SyncState } from '@highpress/core/sync'
import { dexieDraftStore } from './dexieDraftStore'

const doc = (text: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

// 서버 대신 쓰는 가짜. 할당량(초안 3개)도 흉내 낸다.
function fakeRemote(initial: RemoteDraft[] = []) {
  const store = new Map(initial.map((draft) => [draft.id, draft]))
  let down = false
  const remote: DraftRemote = {
    list: vi.fn(async () => {
      if (down) throw new Error('down')
      return [...store.values()]
    }),
    upsert: vi.fn(async (draft: RemoteDraft) => {
      if (down) throw new Error('down')
      if (!store.has(draft.id) && store.size >= 3) throw new QuotaError()
      store.set(draft.id, draft)
    }),
    remove: vi.fn(async (id: string) => {
      if (down) throw new Error('down')
      store.delete(id)
    }),
  }
  return { remote, store, setDown: (value: boolean) => (down = value) }
}

async function draft(title: string, text = '내용') {
  const column = await createColumn()
  await updateColumn(column.id, { title, body: doc(text) })
  return (await db.columns.get(column.id))!
}

afterEach(() => vi.useRealTimers())

describe('올리기', () => {
  it('고친 초안의 글만 올리고, 올린 시각을 적어 둔다 (SB-1)', async () => {
    const column = await draft('첫 글')
    await db.columns.update(column.id, { body: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: 'm1', src: 'blob:x' } }] } })
    const { remote, store } = fakeRemote()
    expect(await pushChanges(dexieDraftStore, remote)).toMatchObject({ pushed: 1, removed: 0 })
    expect(store.get(column.id)).toMatchObject({ title: '첫 글', clientUpdatedAt: column.updatedAt })
    // 사진 주소(이 기기에서만 통하는 blob:)는 보내지 않는다.
    expect(JSON.stringify(store.get(column.id)!.body)).not.toContain('blob:')
    expect((await db.columns.get(column.id))!.serverSyncedAt).toBe(column.updatedAt)

    // 바뀐 것이 없으면 다시 보내지 않는다 (SB-2).
    expect(await pushChanges(dexieDraftStore, remote)).toMatchObject({ pushed: 0 })
    expect(remote.upsert).toHaveBeenCalledTimes(1)
  })

  it('아무것도 쓰지 않은 새 글은 올리지 않는다', async () => {
    const column = await createColumn()
    expect(isBlank(column)).toBe(true)
    const { remote } = fakeRemote()
    expect((await pushChanges(dexieDraftStore, remote)).pushed).toBe(0)
  })

  it('저장을 마친 글은 서버 사본을 지운다 (SB-3)', async () => {
    const column = await draft('마무리할 글')
    const { remote, store } = fakeRemote()
    await pushChanges(dexieDraftStore, remote)
    await updateColumn(column.id, { status: 'saved' })
    expect(await pushChanges(dexieDraftStore, remote)).toMatchObject({ removed: 1 })
    expect(store.has(column.id)).toBe(false)
    expect((await db.columns.get(column.id))!.serverSyncedAt).toBeNull()
  })

  it('이 기기에서 지운 초안은 서버에서도 지운다', async () => {
    const column = await draft('지울 글')
    const { remote, store } = fakeRemote()
    await pushChanges(dexieDraftStore, remote)
    await deleteColumn(column.id)
    expect(await getSetting<string[]>(SYNC_DELETED_KEY, [])).toEqual([column.id])
    await pushChanges(dexieDraftStore, remote)
    expect(store.has(column.id)).toBe(false)
    expect(await getSetting<string[]>(SYNC_DELETED_KEY, [])).toEqual([])
  })

  it('서버에 올린 적 없는 글을 지울 때는 흔적을 남기지 않는다', async () => {
    const column = await draft('기기에만 있던 글')
    await deleteColumn(column.id)
    expect(await getSetting<string[]>(SYNC_DELETED_KEY, [])).toEqual([])
  })

  it('할당량을 넘은 초안은 기기에 남기고, 고칠 때까지 다시 보내지 않는다 (SB-6)', async () => {
    for (const title of ['하나', '둘', '셋', '넷']) await draft(title)
    const { remote, store } = fakeRemote()
    const skip = new Map<string, number>()
    const first = await pushChanges(dexieDraftStore, remote, skip)
    expect(first).toMatchObject({ pushed: 3 })
    expect(first.overQuota).toHaveLength(1)
    expect(store.size).toBe(3)
    expect(await db.columns.count()).toBe(4)

    const second = await pushChanges(dexieDraftStore, remote, skip)
    expect(second.overQuota).toEqual(first.overQuota)
    expect(remote.upsert).toHaveBeenCalledTimes(4)
  })

  it('본문이 1MB를 넘으면 보내지 않는다', async () => {
    await draft('긴 글', 'x'.repeat(1_100_000))
    const { remote } = fakeRemote()
    expect((await pushChanges(dexieDraftStore, remote)).overQuota).toHaveLength(1)
    expect(remote.upsert).not.toHaveBeenCalled()
  })
})

describe('가져오기', () => {
  it('다른 기기에서 쓰던 초안을 이 기기에 만든다', async () => {
    const { remote } = fakeRemote([{ id: 'from-other', title: '다른 기기의 글', body: doc('이어 쓰기'), clientUpdatedAt: 5000 }])
    expect(await pullDrafts(dexieDraftStore, remote)).toBe(1)
    expect(await db.columns.get('from-other')).toMatchObject({ title: '다른 기기의 글', status: 'draft', updatedAt: 5000, serverSyncedAt: 5000 })
    // 방금 받은 것을 다시 올리지 않는다.
    expect((await pushChanges(dexieDraftStore, remote)).pushed).toBe(0)
  })

  it('서버 쪽이 더 최근일 때만 이 기기의 초안을 바꾼다', async () => {
    const column = await draft('내 글', '이 기기에서 쓴 내용')
    const { remote, store } = fakeRemote([{ id: column.id, title: '예전 내용', body: doc('예전'), clientUpdatedAt: column.updatedAt - 1000 }])
    expect(await pullDrafts(dexieDraftStore, remote)).toBe(0)
    expect((await db.columns.get(column.id))!.title).toBe('내 글')

    store.set(column.id, { id: column.id, title: '다른 기기에서 고친 글', body: doc('새 내용'), clientUpdatedAt: column.updatedAt + 1000 })
    expect(await pullDrafts(dexieDraftStore, remote)).toBe(1)
    expect((await db.columns.get(column.id))!.title).toBe('다른 기기에서 고친 글')
  })

  it('저장을 마친 글과 이 기기에서 지운 글은 되살리지 않는다', async () => {
    const saved = await draft('저장한 글')
    await db.columns.update(saved.id, { status: 'saved' })
    const gone = await draft('지운 글')
    const { remote, store } = fakeRemote()
    await db.columns.update(gone.id, { serverSyncedAt: gone.updatedAt })
    await deleteColumn(gone.id)
    store.set(saved.id, { id: saved.id, title: '서버의 옛 초안', body: doc('x'), clientUpdatedAt: saved.updatedAt + 9999 })
    store.set(gone.id, { id: gone.id, title: '지운 글', body: doc('x'), clientUpdatedAt: 9_999_999_999_999 })
    expect(await pullDrafts(dexieDraftStore, remote)).toBe(0)
    expect((await db.columns.get(saved.id))!.title).toBe('저장한 글')
    expect(await db.columns.get(gone.id)).toBeUndefined()
  })

  it('형식이 맞지 않는 서버 데이터는 받지 않고, 사진 주소는 비운다', async () => {
    const { remote } = fakeRemote([
      { id: '../evil', title: 'x', body: doc('x'), clientUpdatedAt: 1 },
      { id: 'not-doc', title: 'x', body: { type: 'paragraph' }, clientUpdatedAt: 1 },
      { id: 'no-time', title: 'x', body: doc('x'), clientUpdatedAt: Number.NaN },
      { id: 'ok', title: 't'.repeat(500), body: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: 'm1', src: 'https://evil.example/x.png' } }] }, clientUpdatedAt: 10 },
    ])
    expect(await pullDrafts(dexieDraftStore, remote)).toBe(1)
    const column = (await db.columns.get('ok'))!
    expect(column.title).toHaveLength(200)
    expect(JSON.stringify(column.body)).not.toContain('evil.example')
  })
})

describe('동기화 엔진', () => {
  it('시작하면 받아 오고 올린 뒤, 변경은 잠시 뒤에 보낸다 (E-14)', async () => {
    const column = await draft('첫 글')
    const { remote, store } = fakeRemote([{ id: 'other', title: '다른 기기', body: doc('x'), clientUpdatedAt: 77 }])
    const states: SyncState[] = []
    const engine = createSyncEngine(dexieDraftStore, remote, (state) => states.push(state), 60)
    await engine.start()
    expect(await db.columns.get('other')).toBeDefined()
    expect(store.has(column.id)).toBe(true)
    expect(states.at(-1)).toMatchObject({ kind: 'synced', overQuota: 0 })

    await updateColumn(column.id, { title: '고친 제목' })
    expect(store.get(column.id)!.title).toBe('첫 글')
    await vi.waitFor(() => expect(store.get(column.id)!.title).toBe('고친 제목'))
    engine.stop()
  })

  it('저장을 마치면 기다리지 않고 바로 서버 사본을 지운다', async () => {
    const column = await draft('곧 저장할 글')
    const { remote, store } = fakeRemote()
    const engine = createSyncEngine(dexieDraftStore, remote, () => undefined, 60_000)
    await engine.start()
    expect(store.has(column.id)).toBe(true)
    await updateColumn(column.id, { status: 'saved' })
    await vi.waitFor(() => expect(store.has(column.id)).toBe(false))
    engine.stop()
  })

  it('서버에 닿지 못하면 알리기만 하고, 기기의 글은 그대로 둔다 (SB-9)', async () => {
    const column = await draft('오프라인에서 쓴 글')
    const { remote, store, setDown } = fakeRemote()
    setDown(true)
    const states: SyncState[] = []
    const engine = createSyncEngine(dexieDraftStore, remote, (state) => states.push(state), 60_000)
    await engine.start()
    expect(states.at(-1)).toEqual({ kind: 'offline' })
    expect((await db.columns.get(column.id))!.title).toBe('오프라인에서 쓴 글')

    // 서버가 돌아오면 다음 차례에 올라간다.
    setDown(false)
    await updateColumn(column.id, { title: '다시 연결됨' })
    await engine.flush()
    await vi.waitFor(() => expect(store.get(column.id)?.title).toBe('다시 연결됨'))
    engine.stop()
  })
})
