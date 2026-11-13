import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from '../../components/icons'
import './moderation.css'

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

interface Props {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  // 닫은 뒤 초점을 돌려줄 자리. 없으면 열기 전에 초점이 있던 자리로 돌아간다.
  returnTo?: RefObject<HTMLElement | null>
  // 제목 아래의 설명 글을 가리키는 id (화면 낭독기가 제목과 함께 읽는다)
  describedBy?: string
}

// 신고 · 차단 · 문의 창. 로그인 창(LoginDialog)과 같은 모양과 동작이다.
// 열리면 창 안으로 초점을 옮기고(data-autofocus 가 있으면 그 자리), Tab 은 창 안에서만 돈다. Esc 나 바깥을 누르면 닫는다.
// 화면 맨 바깥(body)에 그린다. 글 카드처럼 누르면 넘어가는 곳 안에서 열어도 창을 누른 것이 카드로 번지지 않게 한다.
export function Dialog({ title, onClose, children, returnTo, describedBy }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = panel.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus]')
    ;(first ?? node)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const start = items[0]
      const end = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === start || document.activeElement === node)) {
        event.preventDefault()
        end.focus()
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault()
        start.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const target = returnTo
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const back = target?.current ?? opener
      if (back?.isConnected) back.focus()
    }
    // 열릴 때 한 번만 한다.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      className="mod-backdrop"
      onClick={(event) => {
        // 창 안을 누른 것이 창을 연 카드로 번지지 않게 한다 (React 의 이벤트는 포털을 건너 위로 오른다).
        event.stopPropagation()
        if (event.target === event.currentTarget) close.current()
      }}
    >
      <div ref={panel} className="mod-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1}>
        <button type="button" className="mod-dialog__close" aria-label="닫기" title="닫기" onClick={() => close.current()}>
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        <h2 id={titleId} className="mod-dialog__title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
