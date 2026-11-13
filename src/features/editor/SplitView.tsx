import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { LayoutMode } from './layoutMode'
import { loadSplitRatio, ratioFromKey, ratioFromPointer, saveSplitRatio, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN } from './splitRatio'

interface Props {
  left: ReactNode
  // 없으면 왼쪽 창만 전체 너비로 보인다 (E-2).
  right?: ReactNode
  // single: 나누지 않고 한 창만, stack: 위아래, side: 좌우 (기본).
  mode?: LayoutMode
  // 오른쪽 창이 무엇인지 (탭 이름). 바뀌면 새 창이 열리는 움직임을 다시 보여 준다.
  paneKey?: string
  // 창을 연 탭 단추의 가로 가운데 (화면 기준 px). 창이 그 자리에서 자라나 열린다.
  originX?: number | null
}

export function SplitView({ left, right, mode = 'side', paneKey, originX = null }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(SPLIT_DEFAULT)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let active = true
    void loadSplitRatio().then((saved) => active && setRatio(saved))
    return () => {
      active = false
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    // 포인터를 붙잡아 두어 오른쪽 캔버스가 이벤트를 가져가지 못하게 한다 (E-5).
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !container.current) return
    const rect = container.current.getBoundingClientRect()
    // 위아래로 나눈 화면에서는 세로 위치로 비율을 잰다.
    setRatio(mode === 'stack' ? ratioFromPointer(e.clientY, { left: rect.top, width: rect.height }) : ratioFromPointer(e.clientX, rect))
  }

  const endDrag = () => {
    if (!dragging) return
    setDragging(false)
    void saveSplitRatio(ratio)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = mode === 'stack' ? (e.key === 'ArrowUp' ? 'ArrowLeft' : e.key === 'ArrowDown' ? 'ArrowRight' : e.key) : e.key
    const next = ratioFromKey(key, ratio)
    if (next === null) return
    e.preventDefault()
    setRatio(next)
    void saveSplitRatio(next)
  }

  const split = right !== undefined && right !== null

  // 열리는 움직임의 중심을 탭 단추 바로 아래로 맞춘다. 창이 그려진 뒤, 화면에 보이기 전에 정한다.
  useLayoutEffect(() => {
    const node = pane.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = originX === null || rect.width <= 0 ? 50 : Math.min(100, Math.max(0, ((originX - rect.left) / rect.width) * 100))
    node.style.setProperty('--open-x', `${x}%`)
  }, [paneKey, originX, split, mode])
  // 핸드폰에서는 작업 창을 열면 글쓰기 창을 가린다. 쓰던 글과 커서가 남도록 지우지 않고 숨기기만 한다.
  const single = mode === 'single'
  return (
    <div ref={container} className="split" data-mode={mode} data-dragging={dragging || undefined}>
      {/* 옆 창이 열리거나 닫혀 너비가 바뀌면 key 가 바뀌지 않게 두고(쓰던 글과 커서 유지) 모양만 다시 움직인다. */}
      <div className="split__pane split__pane--left" data-split={split || undefined} hidden={single && split} style={split && !single ? { flex: `0 0 ${ratio * 100}%` } : { flex: '1 1 auto' }}>
        {left}
      </div>
      {split && single && (
        <div key={paneKey} ref={pane} className="split__pane split__pane--right">
          {right}
        </div>
      )}
      {split && !single && (
        <>
          <div
            className="split__divider"
            role="separator"
            aria-orientation={mode === 'stack' ? 'horizontal' : 'vertical'}
            aria-label="창 크기 조절"
            aria-valuemin={SPLIT_MIN * 100}
            aria-valuemax={SPLIT_MAX * 100}
            aria-valuenow={Math.round(ratio * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          />
          <div key={paneKey} ref={pane} className="split__pane split__pane--right">
            {right}
          </div>
        </>
      )}
    </div>
  )
}
