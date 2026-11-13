import { getSetting, setSetting } from '../../db/store'

export const SPLIT_RATIO_KEY = 'splitRatio'
export const SPLIT_MIN = 0.25
export const SPLIT_MAX = 0.75
export const SPLIT_DEFAULT = 0.5
export const SPLIT_KEY_STEP = 0.02

export function clampRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SPLIT_DEFAULT
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value))
}

// 왼쪽 창이 차지하는 비율. 컨테이너 너비를 알 수 없으면 기본값.
export function ratioFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return SPLIT_DEFAULT
  return clampRatio((clientX - rect.left) / rect.width)
}

export function ratioFromKey(key: string, current: number): number | null {
  if (key === 'ArrowLeft') return clampRatio(current - SPLIT_KEY_STEP)
  if (key === 'ArrowRight') return clampRatio(current + SPLIT_KEY_STEP)
  if (key === 'Home') return SPLIT_MIN
  if (key === 'End') return SPLIT_MAX
  return null
}

export async function loadSplitRatio(): Promise<number> {
  return clampRatio(await getSetting<unknown>(SPLIT_RATIO_KEY, SPLIT_DEFAULT))
}

export async function saveSplitRatio(ratio: number): Promise<void> {
  await setSetting(SPLIT_RATIO_KEY, clampRatio(ratio))
}
