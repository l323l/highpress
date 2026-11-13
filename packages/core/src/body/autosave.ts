export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message?: string }

// 앱이 직접 던진 한국어 메시지만 화면에 옮긴다. 브라우저 오류 문구는 그대로 보여 주지 않는다.
export function saveErrorState(error: unknown): SaveState {
  const message = error instanceof Error && /[가-힣]/.test(error.message) ? error.message : undefined
  return { kind: 'error', message }
}

export interface Autosave {
  // 변경이 생겼음을 알린다. 첫 변경 뒤 delayMs 안에 반드시 한 번 저장된다 (E-11).
  schedule(): void
  // 대기 중인 변경을 지금 저장한다. 저장에 성공했거나 저장할 것이 없으면 true.
  flush(): Promise<boolean>
  cancel(): void
}

export const AUTOSAVE_DELAY_MS = 2000

export function createAutosave(
  save: () => Promise<void>,
  options: { delayMs?: number; onState?: (state: SaveState) => void } = {},
): Autosave {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  // 저장이 겹치지 않도록 한 줄로 이어 실행한다.
  let chain: Promise<boolean> = Promise.resolve(true)

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const flush = (): Promise<boolean> => {
    clear()
    if (!dirty) return chain
    dirty = false
    options.onState?.({ kind: 'saving' })
    chain = chain
      .then(save)
      .then(
        () => {
          options.onState?.({ kind: 'saved', at: Date.now() })
          return true
        },
        (error: unknown) => {
          dirty = true
          options.onState?.(saveErrorState(error))
          return false
        },
      )
    return chain
  }

  return {
    schedule() {
      dirty = true
      // 타이머를 다시 걸지 않는다. 계속 입력해도 저장이 미뤄지지 않게 하기 위함.
      if (timer === undefined) timer = setTimeout(() => void flush(), delayMs)
    },
    flush,
    cancel() {
      clear()
      dirty = false
    },
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatSaveState(state: SaveState): string {
  if (state.kind === 'saving') return '저장 중…'
  if (state.kind === 'error') return `저장하지 못했습니다 — ${state.message ?? '기기 저장 공간을 확인하고 다시 시도해 주세요.'}`
  if (state.kind === 'idle') return ''
  const d = new Date(state.at)
  return `자동 저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
