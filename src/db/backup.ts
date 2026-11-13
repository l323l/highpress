import {
  BACKUP_MAX_BYTES,
  BACKUP_MESSAGES,
  BackupError,
  keepOwned,
  oneBest,
  openBackup,
  writeBackup,
  type BackupMediaSource,
  type OpenedBackup,
} from '@highpress/core/backup'
import { db } from './db'
import type { Media } from './types'

// 웹 백업 (A4-8). 파일 모양(v2 ZIP 만들기 · v1/v2 열기 · 항목 확인)은 @highpress/core/backup 에 있고,
// 여기서는 Dexie 에서 꺼내고 넣는 일만 한다. 앱(mobile/src/db/backup.ts)과 같은 파일을 주고받는다.

export const MAX_BACKUP_BYTES = BACKUP_MAX_BYTES
export const BACKUP_MIME = 'application/zip'
// 파일 고르기 창에 보일 형식: 새 ZIP(v2)과 예전 JSON(v1)
export const BACKUP_ACCEPT = '.zip,.json,application/zip,application/json'

// 렌더링된 모션그래픽(temp)은 보관 대상이 아니므로 백업에 넣지 않는다. 좌표 원본(tacticProjects)으로 다시 만들 수 있다.
export async function exportBackup(now = Date.now()): Promise<Blob> {
  const [columns, teams, tacticProjects, media] = await Promise.all([
    db.columns.toArray(),
    db.teams.toArray(),
    db.tacticProjects.toArray(),
    db.media.filter((m) => !m.temp && !!m.blob).toArray(),
  ])
  const sources: BackupMediaSource[] = media.map((m) => ({
    id: m.id,
    columnId: m.columnId,
    kind: m.kind,
    mime: m.mime,
    name: m.name,
    tacticProjectId: m.tacticProjectId,
    createdAt: m.createdAt,
    width: null,
    height: null,
    load: async () => new Uint8Array(await m.blob!.arrayBuffer()),
  }))
  const chunks: Uint8Array<ArrayBuffer>[] = []
  await writeBackup({ columns, teams, tacticProjects, media: sources }, (chunk) => void chunks.push(chunk as Uint8Array<ArrayBuffer>), { exportedAt: now, source: 'web' })
  return new Blob(chunks, { type: BACKUP_MIME })
}

export interface ImportResult {
  columns: number
  skipped: number
}

export interface ImportOptions {
  // 기기에 이미 있는 칼럼을 덮어쓰게 될 때 호출된다. false면 아무것도 쓰지 않고 중단한다.
  confirmOverwrite?: (count: number) => boolean | Promise<boolean>
}

function readFile(file: Blob): Promise<Uint8Array> {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

// 같은 id는 백업 내용으로 덮어쓰고, 백업에 없는 기기 데이터는 그대로 둔다.
// 파일을 끝까지 확인한 뒤에만 한 번의 트랜잭션으로 쓴다: 잘못된 파일이면 기기에는 아무것도 바뀌지 않는다.
export async function importBackup(file: Blob, options: ImportOptions = {}): Promise<ImportResult> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error(BACKUP_MESSAGES.tooBig)
  let backup: OpenedBackup
  try {
    backup = openBackup(await readFile(file))
  } catch (error) {
    throw error instanceof BackupError ? new Error(error.message) : new Error(BACKUP_MESSAGES.broken)
  }
  const columns = oneBest(backup.columns)
  const { teams } = backup
  let skipped = backup.skipped

  // 전술 프로젝트와 미디어는 칼럼에 딸린 데이터다: 함께 가져오는 칼럼의 것만 받고,
  // 같은 id가 기기의 다른 칼럼 소유라면 덮어쓰지 않는다.
  const columnIds = new Set(columns.map((c) => c.id))
  const owners = async (table: typeof db.tacticProjects | typeof db.media, ids: string[]) =>
    new Map((await table.bulkGet(ids)).flatMap((row) => (row ? [[row.id, row.columnId] as const] : [])))
  const tacticProjects = keepOwned(backup.tacticProjects, columnIds, await owners(db.tacticProjects, backup.tacticProjects.map((p) => p.id)))
  const mediaInfo = keepOwned(backup.media, columnIds, await owners(db.media, backup.media.map((m) => m.id)))
  skipped += backup.tacticProjects.length - tacticProjects.length + backup.media.length - mediaInfo.length

  const media: Media[] = []
  for (const info of mediaInfo) {
    const data = backup.readMedia(info.id)
    if (!data) {
      skipped += 1
      continue
    }
    const { width: _width, height: _height, ...rest } = info
    media.push({ ...rest, temp: false, size: data.length, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: info.mime }) })
  }

  if (options.confirmOverwrite) {
    const existing = await db.columns.bulkGet(columns.map((c) => c.id))
    const overwritten = existing.filter(Boolean).length
    if (overwritten > 0 && !(await options.confirmOverwrite(overwritten))) throw new Error(BACKUP_MESSAGES.cancelled)
  }

  await db.transaction('rw', db.columns, db.teams, db.tacticProjects, db.media, async () => {
    // 베스트는 한 편만 유지한다: 백업에 베스트가 있으면 기기 쪽 지정을 푼다.
    if (columns.some((c) => c.isBest)) await db.columns.filter((c) => c.isBest).modify({ isBest: false })
    await db.columns.bulkPut(columns)
    await db.teams.bulkPut(teams)
    await db.tacticProjects.bulkPut(tacticProjects)
    await db.media.bulkPut(media)
  })
  return { columns: columns.length, skipped }
}
