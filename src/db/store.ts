import type { JSONContent } from '@tiptap/react'
import { db, newId } from './db'
import { SYNC_DELETED_KEY, type Column, type MediaKind, type Team } from '@highpress/core/db'
import type { Media } from './types'

export const EMPTY_BODY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export async function createColumn(): Promise<Column> {
  const now = Date.now()
  const column: Column = {
    id: newId(),
    title: '',
    body: EMPTY_BODY,
    teamId: null,
    isBest: false,
    status: 'draft',
    publishedUrl: '',
    serverSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.columns.add(column)
  // 기기 저장소가 원본이므로 저장 공간 부족 시 브라우저가 지우지 않도록 요청한다. 거절돼도 동작에는 지장 없다.
  void navigator.storage?.persist?.().catch(() => false)
  return column
}

export type ColumnPatch = Partial<Pick<Column, 'title' | 'body' | 'teamId' | 'status' | 'publishedUrl'>>

export async function updateColumn(id: string, patch: ColumnPatch): Promise<void> {
  const updated = await db.columns.update(id, { ...patch, updatedAt: Date.now() })
  // 다른 탭에서 칼럼을 지운 경우: 저장된 것처럼 보이지 않게 실패로 알린다.
  if (!updated) throw new Error('칼럼이 삭제되어 저장할 수 없습니다.')
}

// 베스트 칼럼은 한 편만 둔다 (H-3, H-4). null이면 지정 해제.
export async function setBestColumn(id: string | null): Promise<void> {
  await db.transaction('rw', db.columns, async () => {
    await db.columns.filter((c) => c.isBest).modify({ isBest: false })
    if (id) await db.columns.update(id, { isBest: true })
  })
}

export async function deleteColumn(id: string): Promise<void> {
  const media = await db.media.where('columnId').equals(id).toArray()
  await db.transaction('rw', db.columns, db.media, db.tacticProjects, db.settings, async () => {
    // 서버에 사본이 있으면 다음 동기화 때 서버에서도 지우도록 적어 둔다. 그러지 않으면 다시 내려받게 된다.
    const column = await db.columns.get(id)
    if (column && column.serverSyncedAt !== null) {
      const deleted = (await db.settings.get(SYNC_DELETED_KEY))?.value
      await db.settings.put({ key: SYNC_DELETED_KEY, value: [...(Array.isArray(deleted) ? deleted : []), id] })
    }
    await db.columns.delete(id)
    await db.media.where('columnId').equals(id).delete()
    await db.tacticProjects.where('columnId').equals(id).delete()
  })
  await Promise.all(media.map((m) => removeOpfsFile(m.opfsPath)))
}

export async function saveTeam(team: Omit<Team, 'id'> & { id?: string }): Promise<Team> {
  const saved: Team = { ...team, id: team.id ?? newId() }
  await db.teams.put(saved)
  return saved
}

export async function deleteTeam(id: string): Promise<void> {
  await db.transaction('rw', db.teams, db.columns, async () => {
    await db.teams.delete(id)
    await db.columns.where('teamId').equals(id).modify({ teamId: null })
  })
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await navigator.storage?.getDirectory?.()) ?? null
  } catch {
    return null
  }
}

async function removeOpfsFile(path: string | undefined): Promise<void> {
  if (!path) return
  const root = await opfsRoot()
  await root?.removeEntry(path).catch(() => undefined)
}

export interface NewMedia {
  columnId: string
  kind: MediaKind
  temp: boolean
  blob: Blob
  name: string
  tacticProjectId?: string
}

export async function putMedia(input: NewMedia): Promise<Media> {
  const media: Media = {
    id: newId(),
    columnId: input.columnId,
    kind: input.kind,
    temp: input.temp,
    mime: input.blob.type,
    name: input.name,
    size: input.blob.size,
    tacticProjectId: input.tacticProjectId ?? null,
    createdAt: Date.now(),
  }
  const root = input.temp ? await opfsRoot() : null
  try {
    if (!root) throw new Error('OPFS 없음')
    const path = `media-${media.id}`
    const handle = await root.getFileHandle(path, { create: true })
    const writable = await handle.createWritable()
    await writable.write(input.blob)
    await writable.close()
    media.opfsPath = path
  } catch {
    // OPFS가 없거나 createWritable을 지원하지 않는 브라우저에서는 IndexedDB에 둔다.
    media.blob = input.blob
  }
  await db.media.add(media)
  return media
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  const media = await db.media.get(id)
  if (!media) return null
  if (media.blob) return media.blob
  if (!media.opfsPath) return null
  try {
    const root = await opfsRoot()
    const handle = await root?.getFileHandle(media.opfsPath)
    const file = await handle?.getFile()
    return file ? new Blob([file], { type: media.mime }) : null
  } catch {
    return null
  }
}

export async function deleteMedia(id: string): Promise<void> {
  const media = await db.media.get(id)
  if (!media) return
  await db.media.delete(id)
  await removeOpfsFile(media.opfsPath)
}
