import type { JSONContent } from '../body/json'
import { isId } from '../db/ids'
import type { Column } from '../db/types'
import { dropImageSrc, stripMediaSrc } from '../body/bodyMedia'
import { utf8Length } from '../backup/bytes'
import { QuotaError, type DraftRemote, type RemoteDraft } from './remote'

// 초안 동기화 (7.1). 기기 저장소가 원본이고, 서버에는 작성 중인 글의 사본만 둔다.
// 자동 저장과는 따로 돈다: 변경이 있을 때만, 조금 늦게 보낸다 (E-14, SB-2).
// 기기 저장소는 DraftStore 로 받는다 (웹 Dexie: src/features/sync/dexieDraftStore.ts, 앱 sqlite: A4-7).

export interface DraftStore {
  // 서버에서도 지워야 할 초안 id (기기에서 지운 것). 설정 SYNC_DELETED_KEY 에 둔다.
  getDeleted(): Promise<string[]>
  setDeleted(ids: string[]): Promise<void>
  getColumn(id: string): Promise<Column | undefined>
  addColumn(column: Column): Promise<void>
  updateColumn(id: string, patch: Partial<Column>): Promise<void>
  listColumns(): Promise<Column[]>
  // 그사이 다시 고치지 않았을 때만(updatedAt 이 그대로일 때만) 올린 시각을 적는다.
  markSynced(id: string, updatedAt: number): Promise<void>
  // 칼럼 목록이나 지운 초안 목록이 바뀔 때마다(처음 한 번 포함) 부른다.
  watch(listener: (snapshot: { columns: Column[]; deleted: string[] }) => void): { unsubscribe(): void }
}

export const SYNC_DELAY_MS = 45_000
export const MAX_TITLE = 200
// 서버 제약(1MB)보다 조금 작게 잡아, 보내기 전에 걸러 낸다.
export const MAX_BODY_BYTES = 1_000_000

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  // overQuota: 할당량 때문에 서버에 올리지 못한 초안 수 (기기에는 저장돼 있다)
  | { kind: 'synced'; at: number; overQuota: number }
  // 서버에 닿지 못했다. 기기 저장은 계속된다 (SB-9).
  | { kind: 'offline' }

function hasContent(node: JSONContent): boolean {
  if (typeof node.text === 'string' && node.text.trim() !== '') return true
  if (node.type && !['doc', 'paragraph', 'text'].includes(node.type)) return true
  return Array.isArray(node.content) && node.content.some(hasContent)
}

// "글쓰기"만 눌러 둔 빈 글은 올리지 않는다.
export function isBlank(column: Pick<Column, 'title' | 'body'>): boolean {
  return column.title.trim() === '' && !hasContent(column.body)
}

const needsPush = (column: Column) => column.status === 'draft' && column.serverSyncedAt !== column.updatedAt && !isBlank(column)
// 저장을 마친 글은 서버 사본을 지운다 (SB-3).
const needsRemoval = (column: Column) => column.status !== 'draft' && column.serverSyncedAt !== null

// UTF-8 바이트 수. 앱(React Native)의 Blob 은 네이티브 메모리를 잡고 놓지 않으므로 쓰지 않는다.
const bytes = (value: unknown) => utf8Length(JSON.stringify(value))

// 서버에서 받은 값을 믿지 않고 형식을 확인한다.
function parseRemote(draft: RemoteDraft): RemoteDraft | null {
  const body = draft.body as unknown
  if (!isId(draft.id) || typeof body !== 'object' || body === null || (body as JSONContent).type !== 'doc') return null
  if (!Number.isFinite(draft.clientUpdatedAt) || draft.clientUpdatedAt <= 0) return null
  try {
    return { ...draft, title: draft.title.slice(0, MAX_TITLE), body: dropImageSrc(body as JSONContent) }
  } catch {
    return null
  }
}

// 서버의 초안을 이 기기로 가져온다. 다른 기기에서 쓰던 글을 이어 쓰기 위함이다.
// 사진은 원래 기기에만 있으므로 그 자리는 "이 기기에 없는 미디어"로 보인다 (SB-8).
export async function pullDrafts(store: DraftStore, remote: DraftRemote): Promise<number> {
  const deleted = new Set(await store.getDeleted())
  let changed = 0
  for (const raw of await remote.list()) {
    const draft = parseRemote(raw)
    if (!draft || deleted.has(draft.id)) continue
    const stamp = { updatedAt: draft.clientUpdatedAt, serverSyncedAt: draft.clientUpdatedAt }
    const local = await store.getColumn(draft.id)
    if (!local) {
      await store.addColumn({ id: draft.id, title: draft.title, body: draft.body, teamId: null, isBest: false, status: 'draft', publishedUrl: '', createdAt: draft.clientUpdatedAt, ...stamp })
      changed += 1
    } else if (local.status === 'draft' && draft.clientUpdatedAt > local.updatedAt) {
      // 서버 쪽이 더 최근이면 그 내용으로 바꾼다. 이 기기에서 더 나중에 고쳤으면 건드리지 않는다.
      await store.updateColumn(draft.id, { title: draft.title, body: draft.body, ...stamp })
      changed += 1
    }
  }
  return changed
}

export interface PushResult {
  pushed: number
  removed: number
  overQuota: string[]
}

// 이 기기의 변경을 서버에 반영한다. skip에 든 초안(할당량 초과로 거절된 것)은 내용이 바뀔 때까지 다시 보내지 않는다.
export async function pushChanges(store: DraftStore, remote: DraftRemote, skip: Map<string, number> = new Map()): Promise<PushResult> {
  const result: PushResult = { pushed: 0, removed: 0, overQuota: [] }

  const deleted = await store.getDeleted()
  if (deleted.length > 0) {
    for (const id of deleted) await remote.remove(id)
    await store.setDeleted([])
    result.removed += deleted.length
  }

  for (const column of await store.listColumns()) {
    if (needsRemoval(column)) {
      await remote.remove(column.id)
      await store.updateColumn(column.id, { serverSyncedAt: null })
      result.removed += 1
    } else if (needsPush(column)) {
      if (skip.get(column.id) === column.updatedAt) {
        result.overQuota.push(column.id)
        continue
      }
      const body = stripMediaSrc(column.body)
      try {
        if (bytes(body) > MAX_BODY_BYTES) throw new QuotaError()
        await remote.upsert({ id: column.id, title: column.title.slice(0, MAX_TITLE), body, clientUpdatedAt: column.updatedAt })
      } catch (error) {
        if (!(error instanceof QuotaError)) throw error
        skip.set(column.id, column.updatedAt)
        result.overQuota.push(column.id)
        continue
      }
      skip.delete(column.id)
      // 보내는 동안 더 고쳤으면 표시하지 않는다. 다음 차례에 다시 보낸다.
      await store.markSynced(column.id, column.updatedAt)
      result.pushed += 1
    }
  }
  return result
}

export interface SyncEngine {
  start(): Promise<void>
  // 기다리는 변경을 지금 보낸다 (화면 이탈 등).
  flush(): Promise<void>
  // 서버에서 다시 받아 오고 보낸다 (앱이 뒤에 있다가 다시 앞으로 왔을 때: 그사이 다른 기기에서 고쳤을 수 있다).
  refresh(): Promise<void>
  stop(): void
}

export function createSyncEngine(store: DraftStore, remote: DraftRemote, onState: (state: SyncState) => void, delayMs = SYNC_DELAY_MS): SyncEngine {
  const skip = new Map<string, number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let chain: Promise<void> = Promise.resolve()
  let stopped = false
  let subscription: { unsubscribe(): void } | undefined

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  // 겹치지 않게 한 줄로 이어 실행한다.
  const run = (work: () => Promise<number>): Promise<void> => {
    clear()
    chain = chain.then(async () => {
      if (stopped) return
      onState({ kind: 'syncing' })
      try {
        const overQuota = await work()
        if (!stopped) onState({ kind: 'synced', at: Date.now(), overQuota })
      } catch {
        if (!stopped) onState({ kind: 'offline' })
      }
    })
    return chain
  }

  const push = () => run(async () => (await pushChanges(store, remote, skip)).overQuota.length)
  const pullAndPush = () =>
    run(async () => {
      await pullDrafts(store, remote)
      return (await pushChanges(store, remote, skip)).overQuota.length
    })

  return {
    async start() {
      await pullAndPush()
      if (stopped) return
      subscription = store.watch(({ columns, deleted }) => {
        // 지우기(저장 완료·삭제)는 바로, 초안 올리기는 조금 뒤에 한다.
        if (deleted.length > 0 || columns.some(needsRemoval)) void push()
        else if (columns.some((column) => needsPush(column) && skip.get(column.id) !== column.updatedAt) && timer === undefined) timer = setTimeout(() => void push(), delayMs)
      })
    },
    flush: () => (timer === undefined ? chain : push()),
    refresh: () => pullAndPush(),
    stop() {
      stopped = true
      clear()
      subscription?.unsubscribe()
    },
  }
}
