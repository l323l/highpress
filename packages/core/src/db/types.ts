import type { JSONContent } from '../body/json'
import { isId } from './ids'

// 웹 · 앱이 함께 쓰는 기기 데이터 모양. 웹의 저장 방식(Dexie 구조 버전, 사진 Blob)은 웹 src/db/types.ts 에 따로 둔다.

export type ColumnStatus = 'draft' | 'saved' | 'published'

export interface Column {
  id: string
  title: string
  body: JSONContent
  teamId: string | null
  isBest: boolean
  status: ColumnStatus
  publishedUrl: string
  // 피드에 올릴 때 마지막으로 고른 구단 (src/lib/clubs.ts 의 id)
  feedClub?: string | null
  // 피드에 올릴 때 마지막으로 고른 대표 사진 (media id). 빈 글자는 "사진 없이"를 골랐다는 뜻이다.
  feedCover?: string | null
  serverSyncedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Team {
  id: string
  name: string
  color: string
}

export type MediaKind = 'image' | 'gif' | 'video'

// 앱 기기 저장(sqlite media 표)에 두는 사진 · 결과물 정보 (A3-7). 파일 자체는 앱 문서 폴더의 path 에 있다.
// 웹은 Blob 을 Dexie 에 함께 두므로 이것을 쓰지 않는다 (웹 src/db/types.ts 의 Media).
export interface MediaRef {
  id: string
  columnId: string
  kind: MediaKind
  // true면 렌더링된 모션그래픽처럼 다시 만들 수 있는 결과물이다. 백업에 넣지 않는다.
  temp: boolean
  mime: string
  name: string
  // 문서 폴더 기준 상대 경로 'media/<id>.<ext>'. iOS는 앱을 고칠 때마다 문서 폴더의 절대 경로가 바뀌므로 상대 경로만 적는다.
  path: string
  width: number | null
  height: number | null
  bytes: number
  tacticProjectId: string | null
  createdAt: number
}

// 기기 파일 이름에 붙이는 확장자. 여기에 없는 형식은 받지 않는다.
export const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

// 'media/<id>.<ext>'. id나 형식이 틀리면 null.
export function mediaPath(id: string, mime: string): string | null {
  const ext = Object.hasOwn(MEDIA_EXTENSIONS, mime) ? MEDIA_EXTENSIONS[mime] : undefined
  return ext && isId(id) ? `media/${id}.${ext}` : null
}

export type TeamSide = 'a' | 'b'

export interface TokenDef {
  id: string
  team: TeamSide
  name?: string
  // 없으면 팀 색을 쓴다.
  color?: string
  // 이 선수만의 크기 배율 (0.5~2). 없으면 1.
  scale?: number
}

// 공은 토큰 목록에 없고 장면의 positions에 이 키로만 들어간다.
export const BALL_ID = 'ball'

export type ShapeKind = 'arrow' | 'line' | 'ellipse'

// from·to는 정규화 좌표. 원(ellipse)은 두 점을 모서리로 하는 상자에 내접한다.
export interface Shape {
  id: string
  kind: ShapeKind
  dashed: boolean
  color: string
  from: Point
  to: Point
}

// 경기장 안쪽 기준 정규화 좌표 (0~1). x는 왼쪽→오른쪽, y는 위→아래.
export interface Point {
  x: number
  y: number
}

// 장면 하나는 한 번의 움직임이다: 시작 위치에서 positions(도착 위치)까지 durationMs 동안 이동한다.
// 시작 위치는 첫 장면만 start에 따로 갖고, 그다음 장면부터는 앞 장면의 도착 위치에서 이어진다.
export interface Scene {
  id: string
  positions: Record<string, Point>
  durationMs: number
  // 첫 장면에서만 쓰인다.
  start?: Record<string, Point>
  // 이 장면에 그린 화살표·선·원
  shapes?: Shape[]
}

export interface TacticProject {
  id: string
  columnId: string
  teamColors: Record<TeamSide, string>
  pitchColor?: string
  // 모든 선수 원의 크기 배율 (0.5~2). 없으면 1.
  tokenScale?: number
  tokens: TokenDef[]
  scenes: Scene[]
  updatedAt: number
}

// 화면 조작과 백업 가져오기가 함께 지키는 한도. 가져온 파일이 이 범위를 벗어나면 인코더가 멈출 수 있다.
export const TACTIC_LIMITS = {
  minDurationMs: 300,
  maxDurationMs: 5000,
  maxScenes: 50,
  maxTokens: 40,
  // 장면 하나에 그릴 수 있는 도형 수
  maxShapes: 40,
  maxNameLength: 10,
} as const

// SVG는 스크립트를 담을 수 있어 받지 않는다 (E-10, SEC-8). 에디터와 백업 가져오기가 같은 기준을 쓴다.
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// 서버에 사본이 있던 초안을 이 기기에서 지웠을 때, 서버에서도 지우도록 그 id를 모아 두는 설정 키 (string[])
export const SYNC_DELETED_KEY = 'syncDeleted'

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'theme'
// 따로 고르지 않았으면 어두운 화면으로 연다.
export const DEFAULT_THEME: Theme = 'dark'

export interface Setting {
  key: string
  value: unknown
}
