import { Dexie, type EntityTable, type Table } from 'dexie'
import { SCHEMA_VERSION, type Media } from './types'
import type { Column, Setting, TacticProject, Team } from '@highpress/core/db'

export const db = new Dexie('football-column-app') as Dexie & {
  columns: EntityTable<Column, 'id'>
  teams: EntityTable<Team, 'id'>
  media: EntityTable<Media, 'id'>
  tacticProjects: EntityTable<TacticProject, 'id'>
  settings: Table<Setting, string>
}

db.version(SCHEMA_VERSION).stores({
  columns: 'id, teamId, status, updatedAt',
  teams: 'id',
  media: 'id, columnId',
  tacticProjects: 'id, columnId',
  settings: 'key',
})

// 새 id. core 함수(전술 장면 · 도형 등)에도 이것을 넘긴다.
export function newId(): string {
  return crypto.randomUUID()
}

