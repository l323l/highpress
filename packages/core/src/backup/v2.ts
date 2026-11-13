import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough, type UnzipFileInfo } from 'fflate'
import { mediaPath, type Column, type TacticProject, type Team } from '../db/types'
import { crc32 } from './bytes'
import {
  BACKUP_MAX_BYTES,
  BACKUP_MESSAGES,
  BACKUP_MIME_TYPES,
  BackupError,
  mediaMaxBytes,
  parseMediaInfo,
  type BackupMediaInfo,
  type BackupSource,
  type OpenedBackup,
} from './format'
import { isNumber, isRecord, isString, parseColumn, parseList, parseTacticProject, parseTeam } from './v1'

// 백업 v2 (ZIP, A4-8 · APP-PLAN 4.2). fflate(순수 JS)로 만들고 읽어 웹 · 앱이 같은 코드를 쓴다.
//   media/<id>.<확장자>  사진 원본 (이미 압축된 형식이라 그대로 담는다)
//   manifest.json        { format, version: 2, exportedAt, source, columns, teams, tacticProjects, media: [{ id, columnId, mime, file, bytes, crc32, ... }] }
// manifest 는 사진을 다 담은 뒤 맨 끝에 넣는다 (사진마다 크기 · CRC 를 적으려면 먼저 읽어야 한다). ZIP 은 끝의 목록으로 찾으므로 순서는 상관없다.

export const BACKUP_FORMAT = 'highpress-backup'
export const BACKUP_VERSION = 2
export const BACKUP_MANIFEST = 'manifest.json'
// manifest 를 풀었을 때의 최대 크기와 ZIP 안 항목 수. 압축 폭탄 · 지나치게 큰 목록을 막는다.
const MANIFEST_MAX_BYTES = 64 * 1024 * 1024
const MAX_ENTRIES = 20_000

const ZIP_MAGIC = [0x50, 0x4b] // 'PK'

export interface BackupMediaSource extends BackupMediaInfo {
  // 사진 바이트를 읽는다. 없으면 null (그 사진만 빼고 계속한다).
  load(): Promise<Uint8Array | null>
}

export interface BackupInput {
  columns: Column[]
  teams: Team[]
  tacticProjects: TacticProject[]
  media: BackupMediaSource[]
}

export interface ManifestMedia extends BackupMediaInfo {
  file: string
  bytes: number
  crc32: number
}

export interface WriteResult {
  media: number
  // 형식 · 크기가 맞지 않거나 읽지 못해 뺀 사진 수
  skipped: number
  bytes: number
}

// ZIP 을 조각(chunk)으로 sink 에 흘려보낸다. 사진은 한 장씩 읽어 바로 내보내므로 메모리에 다 올리지 않는다.
// 웹은 조각을 모아 Blob 으로, 앱은 파일 끝에 덧붙여 쓴다. 200MB 를 넘으면 BackupError (sink 쪽이 쓰던 파일을 지운다).
export async function writeBackup(
  input: BackupInput,
  sink: (chunk: Uint8Array) => void | Promise<void>,
  meta: { exportedAt: number; source: BackupSource },
): Promise<WriteResult> {
  const pending: Uint8Array[] = []
  let failure: unknown = null
  let total = 0
  const zip = new Zip((error, chunk) => {
    if (error) failure = error
    else pending.push(chunk)
  })
  const drain = async () => {
    if (failure) throw failure
    while (pending.length > 0) {
      const chunk = pending.shift()!
      total += chunk.length
      if (total > BACKUP_MAX_BYTES) throw new BackupError(BACKUP_MESSAGES.exportTooBig)
      await sink(chunk)
    }
  }
  const mtime = new Date(meta.exportedAt)

  const entries: ManifestMedia[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const item of input.media) {
    const file = mediaPath(item.id, item.mime)
    if (!file || !BACKUP_MIME_TYPES.includes(item.mime) || seen.has(item.id)) {
      skipped += 1
      continue
    }
    const data = await item.load().catch(() => null)
    if (!data || data.length === 0 || data.length > mediaMaxBytes(item.mime)) {
      skipped += 1
      continue
    }
    seen.add(item.id)
    const entry = new ZipPassThrough(file)
    entry.mtime = mtime
    zip.add(entry)
    entry.push(data, true)
    await drain()
    const { load: _load, ...info } = item
    entries.push({ ...info, file, bytes: data.length, crc32: crc32(data) })
  }

  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: meta.exportedAt,
    source: meta.source,
    columns: input.columns,
    teams: input.teams,
    tacticProjects: input.tacticProjects,
    media: entries,
  }
  const entry = new ZipDeflate(BACKUP_MANIFEST, { level: 6 })
  entry.mtime = mtime
  zip.add(entry)
  entry.push(strToU8(JSON.stringify(manifest)), true)
  zip.end()
  await drain()
  return { media: entries.length, skipped, bytes: total }
}

// 다 모은 바이트가 필요할 때 (시험 · 작은 백업).
export async function writeBackupBytes(input: BackupInput, meta: { exportedAt: number; source: BackupSource }): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const { bytes } = await writeBackup(input, (chunk) => void chunks.push(chunk), meta)
  const out = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export const looksLikeZip = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1]

function listEntries(bytes: Uint8Array): Map<string, UnzipFileInfo> {
  const entries = new Map<string, UnzipFileInfo>()
  try {
    // 거르기만 하고 아무것도 풀지 않는다: 끝의 목록만 읽는다.
    unzipSync(bytes, {
      filter(file) {
        if (entries.size >= MAX_ENTRIES) throw new BackupError(BACKUP_MESSAGES.broken)
        entries.set(file.name, file)
        return false
      },
    })
  } catch {
    throw new BackupError(BACKUP_MESSAGES.broken)
  }
  return entries
}

// 항목 하나만 푼다. 푼 크기는 목록에 적힌 크기(originalSize)를 넘지 않는다 (fflate 가 그 크기의 버퍼에만 쓴다).
function extract(bytes: Uint8Array, info: UnzipFileInfo): Uint8Array | null {
  if (info.compression !== 0 && info.compression !== 8) return null
  try {
    const files = unzipSync(bytes, { filter: (file) => file.name === info.name })
    return files[info.name] ?? null
  } catch {
    return null
  }
}

function parseManifestMedia(v: unknown, entries: ReadonlyMap<string, UnzipFileInfo>): ManifestMedia | null {
  if (!isRecord(v) || !isString(v.mime) || !isString(v.file) || !isNumber(v.bytes) || !isNumber(v.crc32)) return null
  const info = parseMediaInfo(v, v.mime)
  // 파일 이름은 manifest 를 믿지 않고 id · 형식으로 다시 만들어 맞춰 본다 ('../' 같은 경로를 막는다).
  if (!info || v.file !== mediaPath(info.id, info.mime)) return null
  const entry = entries.get(v.file)
  if (!entry || v.bytes <= 0 || v.bytes > mediaMaxBytes(info.mime) || entry.originalSize !== v.bytes) return null
  return { ...info, file: v.file, bytes: v.bytes, crc32: v.crc32 >>> 0 }
}

// ZIP(v2) 백업을 연다. 이 앱의 백업이 아니거나 깨졌으면 BackupError. 사진은 readMedia 로 하나씩 꺼낸다.
export function openV2(bytes: Uint8Array): OpenedBackup {
  const entries = listEntries(bytes)
  const manifestInfo = entries.get(BACKUP_MANIFEST)
  if (!manifestInfo) throw new BackupError(BACKUP_MESSAGES.notOurs)
  if (manifestInfo.originalSize > MANIFEST_MAX_BYTES) throw new BackupError(BACKUP_MESSAGES.tooBig)
  const manifestBytes = extract(bytes, manifestInfo)
  if (!manifestBytes) throw new BackupError(BACKUP_MESSAGES.broken)
  let raw: unknown
  try {
    raw = JSON.parse(strFromU8(manifestBytes))
  } catch {
    throw new BackupError(BACKUP_MESSAGES.broken)
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT || !isNumber(raw.version)) throw new BackupError(BACKUP_MESSAGES.notOurs)
  if (raw.version > BACKUP_VERSION) throw new BackupError(BACKUP_MESSAGES.newer)
  if (raw.version !== BACKUP_VERSION) throw new BackupError(BACKUP_MESSAGES.notOurs)

  const columns = parseList(raw.columns, parseColumn)
  const teams = parseList(raw.teams, parseTeam)
  const tacticProjects = parseList(raw.tacticProjects, parseTacticProject)
  const byId = new Map<string, ManifestMedia>()
  const media = parseList(raw.media, (v) => {
    const item = parseManifestMedia(v, entries)
    if (!item || byId.has(item.id)) return null
    byId.set(item.id, item)
    return item
  })

  return {
    version: 2,
    source: raw.source === 'app' ? 'app' : 'web',
    exportedAt: isNumber(raw.exportedAt) ? raw.exportedAt : null,
    columns: columns.items,
    teams: teams.items,
    tacticProjects: tacticProjects.items,
    media: media.items.map(({ file: _file, bytes: _bytes, crc32: _crc, ...info }) => info),
    skipped: columns.skipped + teams.skipped + tacticProjects.skipped + media.skipped,
    readMedia(id) {
      const item = byId.get(id)
      const entry = item && entries.get(item.file)
      if (!item || !entry) return null
      const data = extract(bytes, entry)
      // 크기와 CRC 가 manifest 와 같아야 한다 (fflate 는 풀 때 CRC 를 확인하지 않는다).
      return data && data.length === item.bytes && crc32(data) === item.crc32 ? data : null
    },
  }
}
