import { dropImageSrc } from '../body/bodyMedia'
import { isHttpUrl } from '../body/urls'
import { isId } from '../db/ids'
import { decodeBase64 } from './bytes'
import { BACKUP_MESSAGES, BackupError, parseMediaInfo, type BackupMediaInfo, type OpenedBackup } from './format'
import {
  BALL_ID,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  TACTIC_LIMITS,
  type Column,
  type ColumnStatus,
  type Point,
  type Shape,
  type ShapeKind,
  type TacticProject,
  type Team,
  type TokenDef,
} from '../db/types'

// 백업 안의 칼럼 · 팀 · 전술을 하나씩 확인해 꺼낸다 (v1 · v2 공통). 파일은 믿을 수 없는 곳에서 오므로 꼴이 틀리면 null.
// v1 파일(웹 JSON, 사진은 dataUrl) 열기도 여기 있다. v2(ZIP)는 v2.ts, 기기에 쓰기는 웹 src/db/backup.ts · 앱 mobile/src/db/backup.ts.

const STATUSES: ColumnStatus[] = ['draft', 'saved', 'published']
// 백업에서 받는 이름 · 제목의 최대 길이
export const BACKUP_MAX_TEXT = 200
const MAX_TEXT = BACKUP_MAX_TEXT

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isString = (v: unknown): v is string => typeof v === 'string'
export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isColor = (v: unknown): v is string => isString(v) && /^#[0-9a-fA-F]{3,8}$/.test(v)
const unit = (n: number) => Math.min(1, Math.max(0, n))

export function parseColumn(v: unknown): Column | null {
  if (!isRecord(v) || !isId(v.id) || !isString(v.title) || !isRecord(v.body) || v.body.type !== 'doc') return null
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return null
  const url = isString(v.publishedUrl) && isHttpUrl(v.publishedUrl) ? v.publishedUrl.trim() : ''
  let body: Column['body']
  try {
    // 저장된 본문은 src를 갖지 않는다. 백업에 든 src(외부 주소 등)는 버린다.
    body = dropImageSrc(v.body)
  } catch {
    return null
  }
  const column: Column = {
    id: v.id,
    title: v.title.slice(0, MAX_TEXT),
    body,
    teamId: isId(v.teamId) ? v.teamId : null,
    isBest: v.isBest === true,
    status: STATUSES.includes(v.status as ColumnStatus) ? (v.status as ColumnStatus) : 'draft',
    publishedUrl: url,
    // 서버 사본 표시는 그 기기의 것이다. 가져온 기기에서는 아직 올린 적이 없다.
    serverSyncedAt: null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
  // 피드에 올릴 때 고른 구단 · 대표 사진 (빈 글자 = "사진 없이"). 고른 적이 없으면 칸이 없다.
  if (isId(v.feedClub)) column.feedClub = v.feedClub
  if (v.feedCover === '' || isId(v.feedCover)) column.feedCover = v.feedCover
  return column
}

export function parseTeam(v: unknown): Team | null {
  if (!isRecord(v) || !isId(v.id) || !isString(v.name) || !isColor(v.color)) return null
  return { id: v.id, name: v.name.slice(0, MAX_TEXT), color: v.color }
}

export function parseTacticProject(v: unknown): TacticProject | null {
  if (!isRecord(v) || !isId(v.id) || !isId(v.columnId) || !isRecord(v.teamColors)) return null
  if (!isColor(v.teamColors.a) || !isColor(v.teamColors.b) || !Array.isArray(v.tokens) || !Array.isArray(v.scenes)) return null
  const { minDurationMs, maxDurationMs, maxScenes, maxTokens, maxShapes, maxNameLength } = TACTIC_LIMITS
  if (v.tokens.length > maxTokens || v.scenes.length === 0 || v.scenes.length > maxScenes) return null
  const tokens: TokenDef[] = []
  for (const t of v.tokens) {
    if (!isRecord(t) || !isId(t.id) || (t.team !== 'a' && t.team !== 'b')) continue
    const token: TokenDef = { id: t.id, team: t.team }
    if (isString(t.name) && t.name) token.name = t.name.slice(0, maxNameLength)
    if (isColor(t.color)) token.color = t.color
    if (isNumber(t.scale) && t.scale !== 1) token.scale = Math.min(2, Math.max(0.5, t.scale))
    tokens.push(token)
  }
  // 위치를 가질 수 있는 것은 선수 토큰과 공뿐이다 (__proto__ 같은 키 차단).
  const movable = new Set([...tokens.map((t) => t.id), BALL_ID])
  const scenes: TacticProject['scenes'] = []
  for (const s of v.scenes) {
    if (!isRecord(s) || !isId(s.id) || !isNumber(s.durationMs) || !isRecord(s.positions)) return null
    const parsePositions = (raw: Record<string, unknown>) => {
      const positions = new Map<string, Point>()
      for (const [tokenId, p] of Object.entries(raw)) {
        const point = parsePoint(p)
        if (movable.has(tokenId) && point) positions.set(tokenId, point)
      }
      return Object.fromEntries(positions)
    }
    scenes.push({
      id: s.id,
      positions: parsePositions(s.positions),
      // 시작 위치는 첫 장면만 갖는다.
      ...(scenes.length === 0 && isRecord(s.start) ? { start: parsePositions(s.start) } : {}),
      durationMs: Math.min(maxDurationMs, Math.max(minDurationMs, Math.round(s.durationMs))),
      shapes: (Array.isArray(s.shapes) ? s.shapes : [])
        .map(parseShape)
        .filter((shape) => shape !== null)
        .slice(0, maxShapes),
    })
  }
  const project: TacticProject = {
    id: v.id,
    columnId: v.columnId,
    teamColors: { a: v.teamColors.a, b: v.teamColors.b },
    tokens,
    scenes,
    updatedAt: isNumber(v.updatedAt) ? v.updatedAt : Date.now(),
  }
  if (isColor(v.pitchColor)) project.pitchColor = v.pitchColor
  if (isNumber(v.tokenScale) && v.tokenScale !== 1) project.tokenScale = Math.min(2, Math.max(0.5, v.tokenScale))
  return project
}

function parsePoint(v: unknown): Point | null {
  return isRecord(v) && isNumber(v.x) && isNumber(v.y) ? { x: unit(v.x), y: unit(v.y) } : null
}

const SHAPE_KINDS: ShapeKind[] = ['arrow', 'line', 'ellipse']

function parseShape(v: unknown): Shape | null {
  if (!isRecord(v) || !isId(v.id) || !SHAPE_KINDS.includes(v.kind as ShapeKind) || !isColor(v.color)) return null
  const from = parsePoint(v.from)
  const to = parsePoint(v.to)
  if (!from || !to) return null
  return { id: v.id, kind: v.kind as ShapeKind, dashed: v.dashed === true, color: v.color, from, to }
}

// ── v1 파일 (웹 JSON) ───────────────────────────────────

export const V1_APP_ID = 'football-column-app'
// v1 파일의 schemaVersion (웹 Dexie 구조 버전 1). 이보다 크면 더 새 웹이 만든 파일이다.
export const V1_SCHEMA_VERSION = 1

// 목록 하나를 parse 로 확인한다. 버린 수를 함께 돌려준다.
export function parseList<T>(value: unknown, parse: (v: unknown) => T | null): { items: T[]; skipped: number } {
  const list = Array.isArray(value) ? value : []
  const items = list.map(parse).filter((x): x is T => x !== null)
  return { items, skipped: list.length - items.length }
}

const DATA_URL = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]*)$/

// 이미 JSON.parse 한 v1 파일. 이 앱의 파일이 아니면 BackupError.
export function openV1(raw: unknown): OpenedBackup {
  if (!isRecord(raw) || raw.app !== V1_APP_ID || !isNumber(raw.schemaVersion)) throw new BackupError(BACKUP_MESSAGES.notOurs)
  if (raw.schemaVersion > V1_SCHEMA_VERSION) throw new BackupError(BACKUP_MESSAGES.newer)
  const columns = parseList(raw.columns, parseColumn)
  const teams = parseList(raw.teams, parseTeam)
  const tacticProjects = parseList(raw.tacticProjects, parseTacticProject)

  // 사진은 dataUrl 글자로 들고 있다가 꺼낼 때 푼다 (SVG 등 받지 않는 형식은 여기서 버린다).
  const encoded = new Map<string, string>()
  const media = parseList(raw.media, (v): BackupMediaInfo | null => {
    if (!isRecord(v) || !isString(v.dataUrl)) return null
    const match = DATA_URL.exec(v.dataUrl)
    if (!match || !IMAGE_MIME_TYPES.includes(match[1])) return null
    const info = parseMediaInfo(v, match[1])
    if (!info || encoded.has(info.id)) return null
    encoded.set(info.id, match[2])
    return info
  })

  return {
    version: 1,
    source: 'web',
    exportedAt: isNumber(raw.exportedAt) ? raw.exportedAt : null,
    columns: columns.items,
    teams: teams.items,
    tacticProjects: tacticProjects.items,
    media: media.items,
    skipped: columns.skipped + teams.skipped + tacticProjects.skipped + media.skipped,
    readMedia(id) {
      const text = encoded.get(id)
      const data = text === undefined ? null : decodeBase64(text)
      return data && data.length > 0 && data.length <= IMAGE_MAX_BYTES ? data : null
    },
  }
}
