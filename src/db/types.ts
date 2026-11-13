import type { MediaKind } from '@highpress/core/db'

// 웹 기기 저장(Dexie)에만 있는 것. 칼럼 · 팀 · 전술 같은 공통 모양은 @highpress/core/db 에 있다.

// 기기 데이터 구조 버전. 구조를 바꾸면 db.ts에 새 version()과 upgrade()를 추가한다 (PRD A-9).
export const SCHEMA_VERSION = 1

// 본문 사진(temp=false)과 렌더링된 모션그래픽(temp=true, PRD의 TempMedia)을 한 테이블에 둔다.
// temp 미디어는 OPFS를 쓸 수 있으면 opfsPath에, 아니면 blob에 저장된다.
export interface Media {
  id: string
  columnId: string
  kind: MediaKind
  temp: boolean
  mime: string
  name: string
  size: number
  tacticProjectId: string | null
  createdAt: number
  blob?: Blob
  opfsPath?: string
}
