import { useEffect, useSyncExternalStore } from 'react'
import { getServer } from '../../lib/supabase'
import { createRemote, createSyncEngine, type SyncState } from '@highpress/core/sync'
import { dexieDraftStore } from './dexieDraftStore'

let state: SyncState = { kind: 'idle' }
const listeners = new Set<() => void>()

function set(next: SyncState): void {
  state = next
  for (const listener of listeners) listener()
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

// 로그인하고 약관에 동의한 동안 초안 동기화를 돌린다. userId가 null이면 멈춘다.
export function useDraftSync(userId: string | null): void {
  useEffect(() => {
    const pending = userId ? getServer() : null
    if (!pending) return
    let engine: ReturnType<typeof createSyncEngine> | undefined
    let cancelled = false
    void pending.then((server) => {
      if (cancelled) return
      engine = createSyncEngine(dexieDraftStore, createRemote(server), set)
      void engine.start()
    })
    // 탭을 떠날 때 기다리던 변경을 보낸다 (SB-2).
    const onHide = () => {
      if (document.visibilityState === 'hidden') void engine?.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onHide)
      engine?.stop()
      set({ kind: 'idle' })
    }
  }, [userId])
}
