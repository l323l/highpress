import { strFromU8 } from 'fflate'
import { BACKUP_MAX_BYTES, BACKUP_MESSAGES, BackupError, type OpenedBackup } from './format'
import { openV1 } from './v1'
import { looksLikeZip, openV2 } from './v2'

// 백업 파일을 연다: ZIP 이면 v2, 아니면 v1(JSON). 아직 기기에는 아무것도 쓰지 않는다.
// 이 앱의 파일이 아니거나 깨졌으면 BackupError (기기의 데이터는 그대로다).
export function openBackup(bytes: Uint8Array): OpenedBackup {
  if (bytes.length > BACKUP_MAX_BYTES) throw new BackupError(BACKUP_MESSAGES.tooBig)
  if (looksLikeZip(bytes)) return openV2(bytes)
  let raw: unknown
  try {
    raw = JSON.parse(strFromU8(bytes))
  } catch {
    throw new BackupError(BACKUP_MESSAGES.notReadable)
  }
  return openV1(raw)
}
