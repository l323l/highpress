import { useCallback, useEffect, useRef, useState } from 'react'
import type { TacticProject } from '@highpress/core/db'
import { totalDurationMs } from '@highpress/core/tactics'

export interface PlayRange {
  fromMs: number
  toMs: number
}

// timeMs가 null이면 정지 상태. 구간의 끝까지 재생하면 스스로 멈춘다 (M-7).
// 구간을 주지 않으면 전체를, 주면 그 구간(장면 하나)만 재생한다.
export function usePlayback(project: TacticProject | null) {
  const [timeMs, setTimeMs] = useState<number | null>(null)
  const frame = useRef(0)

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    setTimeMs(null)
  }, [])

  const play = useCallback(
    (range?: PlayRange) => {
      if (!project) return
      cancelAnimationFrame(frame.current)
      const { fromMs, toMs } = range ?? { fromMs: 0, toMs: totalDurationMs(project) }
      const start = performance.now()
      const tick = (now: number) => {
        const time = fromMs + (now - start)
        if (time >= toMs) {
          setTimeMs(null)
          return
        }
        setTimeMs(Math.max(fromMs, time))
        frame.current = requestAnimationFrame(tick)
      }
      setTimeMs(fromMs)
      frame.current = requestAnimationFrame(tick)
    },
    [project],
  )

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return { timeMs, playing: timeMs !== null, play, stop }
}
