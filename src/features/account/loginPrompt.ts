import { useSyncExternalStore } from 'react'

// "로그인 · 가입"을 누르면 뜨는 창(로그인 방법 고르기)이 열려 있는지. 어느 화면에서나 열 수 있게 한곳에 둔다.
let open = false
const listeners = new Set<() => void>()

function set(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export const openLogin = () => set(true)
export const closeLogin = () => set(false)

export function useLoginPrompt(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
  )
}
