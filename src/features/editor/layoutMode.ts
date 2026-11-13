import { useSyncExternalStore } from 'react'

// 편집 화면을 나누는 방식.
// single: 핸드폰. 나누지 않고 고른 탭 하나만 화면 전체에 보여 준다.
// stack: 세로로 든 패드. 글쓰기 창과 작업 창을 위아래로 나눈다.
// side: 가로로 든 패드와 PC. 좌우로 나눈다.
export type LayoutMode = 'single' | 'stack' | 'side'

// 핸드폰은 세로로 들면 너비가 좁고, 가로로 눕히면 높이가 낮다.
export const PHONE_QUERY = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)'
export const STACK_QUERY = '(max-width: 1100px) and (orientation: portrait)'

export function layoutModeFrom(phone: boolean, portrait: boolean): LayoutMode {
  if (phone) return 'single'
  return portrait ? 'stack' : 'side'
}

function readMode(): LayoutMode {
  // matchMedia 가 없는 환경(시험 등)에서는 넓은 화면으로 본다.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'side'
  return layoutModeFrom(window.matchMedia(PHONE_QUERY).matches, window.matchMedia(STACK_QUERY).matches)
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const lists = [window.matchMedia(PHONE_QUERY), window.matchMedia(STACK_QUERY)]
  lists.forEach((list) => list.addEventListener('change', onChange))
  return () => lists.forEach((list) => list.removeEventListener('change', onChange))
}

// 화면을 돌리거나 창 크기를 바꾸면 따라 바뀐다.
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, readMode, () => 'side' as const)
}
