import type { ReactNode } from 'react'

interface Props {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}

export function ToolButton({ label, onClick, active, disabled, children }: Props) {
  return (
    <button
      type="button"
      className="tool-btn"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // 버튼을 눌러도 본문의 선택 영역이 풀리지 않게 한다.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
