import { useEffect } from 'react'
import { getFeedRemote } from './remote'

export const displayName = (nickname: string) => nickname.trim() || '이름 없음'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function timeAgo(at: number, now = Date.now()): string {
  const passed = Math.max(0, now - at)
  if (passed < MINUTE) return '방금'
  if (passed < HOUR) return `${Math.floor(passed / MINUTE)}분 전`
  if (passed < DAY) return `${Math.floor(passed / HOUR)}시간 전`
  if (passed < 7 * DAY) return `${Math.floor(passed / DAY)}일 전`
  return new Date(at).toLocaleDateString('ko-KR')
}

// 이 시간 안에 앱을 열어 둔 사람을 "접속 중"으로 표시한다.
const ONLINE_MS = 10 * MINUTE

export const isOnline = (person: { lastSeenAt: number | null }, now = Date.now()) => person.lastSeenAt !== null && now - person.lastSeenAt < ONLINE_MS

const PRESENCE_MS = 4 * MINUTE

// 앱을 열어 둔 동안 접속 시각을 남긴다. 피드 위쪽의 "접속 중" 표시에 쓰인다.
export function usePresence(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const touch = () => {
      if (document.visibilityState !== 'visible') return
      void getFeedRemote()
        .then((remote) => remote?.touch())
        .catch(() => undefined)
    }
    touch()
    const timer = window.setInterval(touch, PRESENCE_MS)
    return () => window.clearInterval(timer)
  }, [active])
}
