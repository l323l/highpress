import { isId } from '../db/ids'
import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES, type Column, type MediaKind, type TacticProject, type Team } from '../db/types'

// 백업 파일의 공통 모양 · 한도 · 오류 문구 (A4-8). 웹과 앱이 같은 파일을 주고받는다 (APP-PRD 6.4, D9).
//   v1: 웹이 쓰던 JSON 한 덩어리 (사진은 dataUrl). 이제 읽기만 한다.
//   v2: ZIP. manifest.json(칼럼 · 팀 · 전술 · 사진 정보 + 사진마다 크기 · CRC-32) + media/<id>.<확장자>(사진 원본).

// 파일 하나의 최대 크기. 앱은 가져올 때 파일 전체를 메모리에 올리므로 이보다 크게 잡지 않는다.
// 앱 사진은 긴 변 2560px로 줄여 넣는다(2026-10-25 결정). JPEG 한 장이 대략 1~2MB라 사진 100~200장이 들어간다.
export const BACKUP_MAX_BYTES = 200 * 1024 * 1024
// MP4(영상 편집 결과)는 사진보다 크게 받는다. 다시 만들 수 있는 임시 결과물(temp)은 애초에 백업에 넣지 않는다.
export const BACKUP_VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const BACKUP_MIME_TYPES: readonly string[] = [...IMAGE_MIME_TYPES, 'video/mp4']

export type BackupSource = 'web' | 'app'

// 백업에 드는 사진 한 장의 정보. 파일 자체(바이트)는 따로 읽는다.
export interface BackupMediaInfo {
  id: string
  columnId: string
  kind: MediaKind
  mime: string
  name: string
  tacticProjectId: string | null
  createdAt: number
  // 웹은 크기를 적어 두지 않는다 (null)
  width: number | null
  height: number | null
}

export interface BackupData {
  columns: Column[]
  teams: Team[]
  tacticProjects: TacticProject[]
}

// 연 백업. 사진 바이트는 하나씩 readMedia 로 꺼낸다 (전부 한꺼번에 풀면 앱 메모리가 모자랄 수 있다).
export interface OpenedBackup extends BackupData {
  version: 1 | 2
  // 어디서 만든 백업인지 (v1은 늘 웹)
  source: BackupSource
  exportedAt: number | null
  media: BackupMediaInfo[]
  // 모양이 틀려 버린 항목 수 (칼럼 · 팀 · 전술 · 사진 정보)
  skipped: number
  // 사진 바이트. 크기 · CRC가 맞지 않거나 꺼낼 수 없으면 null (그 사진만 건너뛴다).
  readMedia(id: string): Uint8Array | null
}

// 백업 파일 자체를 받을 수 없을 때. message 는 화면에 그대로 보여 줄 한국어 문구다.
export class BackupError extends Error {}

export const BACKUP_MESSAGES = {
  tooBig: '백업 파일이 너무 큽니다 (최대 200MB).',
  notReadable: '백업 파일을 읽을 수 없습니다. ZIP 또는 JSON 형식이 아닙니다.',
  notOurs: '이 앱의 백업 파일이 아닙니다.',
  broken: '백업 파일이 손상되어 읽을 수 없습니다. 다시 내보낸 파일로 시도해 주세요.',
  newer: '더 최신 버전에서 만든 백업입니다. 웹은 새로고침, 앱은 업데이트한 뒤 다시 시도해 주세요.',
  exportTooBig: '사진이 많아 백업이 200MB를 넘습니다. 쓰지 않는 사진이 든 칼럼을 지운 뒤 다시 내보내 주세요.',
  cancelled: '가져오기를 취소했습니다. 기기의 칼럼은 그대로입니다.',
} as const

export function mediaKindOf(mime: string): MediaKind {
  return mime === 'image/gif' ? 'gif' : mime === 'video/mp4' ? 'video' : 'image'
}

export function mediaMaxBytes(mime: string): number {
  return mime === 'video/mp4' ? BACKUP_VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
}

// 가져오는 칼럼에 딸린 전술 · 사진만 받는다. 같은 id 가 기기의 다른 칼럼 소유라면 덮어쓰지 않는다.
// owners: 기기에 이미 있는 id → 그 소유 칼럼 id
export function keepOwned<T extends { id: string; columnId: string }>(items: T[], columnIds: ReadonlySet<string>, owners: ReadonlyMap<string, string>): T[] {
  return items.filter((item) => columnIds.has(item.columnId) && (!owners.has(item.id) || owners.get(item.id) === item.columnId))
}

// 베스트 칼럼은 한 편만 둔다: 백업 안에서도 가장 마지막 것 하나만 남긴다.
export function oneBest(columns: Column[]): Column[] {
  let last = -1
  columns.forEach((c, i) => {
    if (c.isBest) last = i
  })
  return columns.map((c, i) => (c.isBest && i !== last ? { ...c, isBest: false } : c))
}

// 백업의 사진 정보 한 줄을 확인한다 (v1 · v2 공통 칸). 틀리면 null.
export function parseMediaInfo(v: Record<string, unknown>, mime: string): BackupMediaInfo | null {
  if (!isId(v.id) || !isId(v.columnId) || !BACKUP_MIME_TYPES.includes(mime)) return null
  const size = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n) : null)
  return {
    id: v.id,
    columnId: v.columnId,
    kind: mediaKindOf(mime),
    mime,
    name: typeof v.name === 'string' ? v.name.slice(0, 200) : 'image',
    tacticProjectId: isId(v.tacticProjectId) ? v.tacticProjectId : null,
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : Date.now(),
    width: size(v.width),
    height: size(v.height),
  }
}
