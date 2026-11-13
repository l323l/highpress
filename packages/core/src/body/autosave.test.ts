import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave, formatSaveState, saveErrorState, type SaveState } from './autosave'

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('변경 뒤 지연 시간이 지나면 한 번 저장한다', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save, { delayMs: 2000 })
    autosave.schedule()
    await vi.advanceTimersByTimeAsync(1999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('계속 변경해도 첫 변경 기준으로 3초 안에 저장한다', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save)
    for (let i = 0; i < 6; i++) {
      autosave.schedule()
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush는 기다리지 않고 저장하고, 예약된 저장을 다시 실행하지 않는다', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save, { delayMs: 2000 })
    autosave.schedule()
    await expect(autosave.flush()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('변경이 없으면 flush가 저장하지 않는다', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save)
    await expect(autosave.flush()).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('cancel하면 예약된 저장이 사라진다', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save, { delayMs: 2000 })
    autosave.schedule()
    autosave.cancel()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('저장 상태를 순서대로 알린다', async () => {
    const states: SaveState[] = []
    const autosave = createAutosave(async () => {}, { onState: (s) => states.push(s) })
    autosave.schedule()
    await autosave.flush()
    expect(states.map((s) => s.kind)).toEqual(['saving', 'saved'])
  })

  it('저장에 실패하면 false를 돌려주고 다음 flush에서 다시 시도한다', async () => {
    const save = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    const states: SaveState[] = []
    const autosave = createAutosave(save, { onState: (s) => states.push(s) })
    autosave.schedule()
    await expect(autosave.flush()).resolves.toBe(false)
    expect(states.at(-1)?.kind).toBe('error')
    await expect(autosave.flush()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('저장이 겹치지 않게 차례로 실행한다', async () => {
    let running = 0
    let maxRunning = 0
    const save = vi.fn(async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 100))
      running--
    })
    const autosave = createAutosave(save)
    autosave.schedule()
    const first = autosave.flush()
    autosave.schedule()
    const second = autosave.flush()
    await vi.advanceTimersByTimeAsync(300)
    await Promise.all([first, second])
    expect(save).toHaveBeenCalledTimes(2)
    expect(maxRunning).toBe(1)
  })
})

describe('formatSaveState', () => {
  it('상태별 문구를 만든다', () => {
    expect(formatSaveState({ kind: 'idle' })).toBe('')
    expect(formatSaveState({ kind: 'saving' })).toBe('저장 중…')
    expect(formatSaveState({ kind: 'error' })).toBe('저장하지 못했습니다 — 기기 저장 공간을 확인하고 다시 시도해 주세요.')
    expect(formatSaveState(saveErrorState(new Error('칼럼이 삭제되어 저장할 수 없습니다.')))).toBe(
      '저장하지 못했습니다 — 칼럼이 삭제되어 저장할 수 없습니다.',
    )
    expect(saveErrorState(new Error('QuotaExceededError'))).toEqual({ kind: 'error', message: undefined })
    expect(formatSaveState({ kind: 'saved', at: new Date(2026, 0, 2, 9, 5, 7).getTime() })).toBe('자동 저장됨 09:05:07')
  })
})
