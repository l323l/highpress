/// <reference types="node" />
import { Blob as NodeBlob } from 'node:buffer'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  createColumn,
  deleteColumn,
  deleteMedia,
  deleteTeam,
  getMediaBlob,
  getSetting,
  putMedia,
  saveTeam,
  setBestColumn,
  setSetting,
  updateColumn,
} from './store'

// jsdom의 Blob은 fake-indexeddb의 structuredClone을 거치면 빈 객체가 되므로 Node Blob으로 바꿔 쓴다.
beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob)
})
afterAll(() => {
  vi.unstubAllGlobals()
})

const png = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })

describe('칼럼', () => {
  it('createColumn은 기본값으로 저장한다', async () => {
    const c = await createColumn()
    expect(c).toMatchObject({ title: '', teamId: null, isBest: false, status: 'draft', publishedUrl: '', serverSyncedAt: null })
    expect(c.createdAt).toBe(c.updatedAt)
    expect(await db.columns.get(c.id)).toEqual(c)
  })

  it('updateColumn은 updatedAt을 갱신한다', async () => {
    const c = await createColumn()
    await new Promise((r) => setTimeout(r, 5))
    await updateColumn(c.id, { title: '제목', status: 'saved' })
    const after = await db.columns.get(c.id)
    expect(after).toMatchObject({ title: '제목', status: 'saved', createdAt: c.createdAt })
    expect(after!.updatedAt).toBeGreaterThan(c.updatedAt)
  })

  it('updateColumn은 없는 id면 거부한다', async () => {
    await expect(updateColumn('none', { title: 'x' })).rejects.toThrow('삭제되어')
  })

  it('setBestColumn은 베스트를 한 편만 유지하고 null이면 해제한다', async () => {
    const a = await createColumn()
    const b = await createColumn()
    await setBestColumn(a.id)
    await setBestColumn(b.id)
    expect((await db.columns.toArray()).filter((c) => c.isBest).map((c) => c.id)).toEqual([b.id])
    await setBestColumn(null)
    expect((await db.columns.toArray()).some((c) => c.isBest)).toBe(false)
  })

  it('deleteColumn은 미디어와 전술 프로젝트를 함께 지운다', async () => {
    const a = await createColumn()
    const b = await createColumn()
    await putMedia({ columnId: a.id, kind: 'image', temp: false, blob: png(), name: 'a.png' })
    const keep = await putMedia({ columnId: b.id, kind: 'image', temp: false, blob: png(), name: 'b.png' })
    await db.tacticProjects.bulkAdd([
      { id: 't1', columnId: a.id, teamColors: { a: '#fff', b: '#000' }, tokens: [], scenes: [], updatedAt: 1 },
      { id: 't2', columnId: b.id, teamColors: { a: '#fff', b: '#000' }, tokens: [], scenes: [], updatedAt: 1 },
    ])
    await deleteColumn(a.id)
    expect(await db.columns.get(a.id)).toBeUndefined()
    expect(await db.media.where('columnId').equals(a.id).count()).toBe(0)
    expect((await db.tacticProjects.toArray()).map((t) => t.id)).toEqual(['t2'])
    expect(await db.media.get(keep.id)).toBeDefined()
  })
})

describe('팀', () => {
  it('saveTeam은 id를 만들고, id가 있으면 덮어쓴다', async () => {
    const t = await saveTeam({ name: 'A팀', color: '#ff0000' })
    expect(t.id).toBeTruthy()
    await saveTeam({ ...t, name: 'B팀' })
    expect(await db.teams.toArray()).toEqual([{ ...t, name: 'B팀' }])
  })

  it('deleteTeam은 칼럼의 teamId를 비운다', async () => {
    const t = await saveTeam({ name: 'A팀', color: '#ff0000' })
    const c = await createColumn()
    await updateColumn(c.id, { teamId: t.id })
    await deleteTeam(t.id)
    expect(await db.teams.count()).toBe(0)
    expect((await db.columns.get(c.id))!.teamId).toBeNull()
  })
})

describe('설정', () => {
  it('저장한 값을 읽고, 없으면 기본값을 돌려준다', async () => {
    expect(await getSetting('theme', 'light')).toBe('light')
    await setSetting('theme', 'dark')
    expect(await getSetting('theme', 'light')).toBe('dark')
  })
})

describe('미디어', () => {
  it('putMedia → getMediaBlob → deleteMedia', async () => {
    const c = await createColumn()
    const m = await putMedia({ columnId: c.id, kind: 'image', temp: false, blob: png(), name: 'x.png' })
    expect(m).toMatchObject({ mime: 'image/png', size: 4, name: 'x.png', tacticProjectId: null })
    const blob = await getMediaBlob(m.id)
    expect(blob!.size).toBe(4)
    expect(blob!.type).toBe('image/png')
    await deleteMedia(m.id)
    expect(await getMediaBlob(m.id)).toBeNull()
  })

  it('OPFS를 쓸 수 없으면 temp 미디어도 IndexedDB에 저장한다', async () => {
    const c = await createColumn()
    const m = await putMedia({ columnId: c.id, kind: 'gif', temp: true, blob: png(), name: 't.gif' })
    expect(m.opfsPath).toBeUndefined()
    expect(m.blob).toBeDefined()
    expect((await getMediaBlob(m.id))!.size).toBe(4)
  })

  it('없는 id는 null이고 삭제해도 오류가 없다', async () => {
    expect(await getMediaBlob('none')).toBeNull()
    await expect(deleteMedia('none')).resolves.toBeUndefined()
  })
})
