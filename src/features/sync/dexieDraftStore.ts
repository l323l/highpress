import { SYNC_DELETED_KEY } from '@highpress/core/db'
import type { DraftStore } from '@highpress/core/sync'
import { liveQuery } from 'dexie'
import { db } from '../../db/db'
import { getSetting, setSetting } from '../../db/store'

// 초안 동기화(@highpress/core/sync)가 쓰는 웹 기기 저장소 (Dexie).
export const dexieDraftStore: DraftStore = {
  getDeleted: () => getSetting<string[]>(SYNC_DELETED_KEY, []),
  setDeleted: (ids) => setSetting(SYNC_DELETED_KEY, ids),
  getColumn: (id) => db.columns.get(id),
  async addColumn(column) {
    await db.columns.add(column)
  },
  async updateColumn(id, patch) {
    await db.columns.update(id, patch)
  },
  listColumns: () => db.columns.toArray(),
  async markSynced(id, updatedAt) {
    await db.columns.where('id').equals(id).and((current) => current.updatedAt === updatedAt).modify({ serverSyncedAt: updatedAt })
  },
  watch: (listener) =>
    liveQuery(async () => ({ columns: await db.columns.toArray(), deleted: await getSetting<string[]>(SYNC_DELETED_KEY, []) })).subscribe(listener),
}
