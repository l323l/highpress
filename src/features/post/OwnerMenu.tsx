import { useEffect, useId, useRef, useState } from 'react'
import { DotsThreeIcon, PencilSimpleIcon, TrashIcon } from '../../components/icons'

interface Props {
  busy: boolean
  onEdit: () => void
  onRemove: () => void
}

// 내 글에만 보이는 "…" 메뉴: 글 고치기와 피드에서 내리기. 되돌릴 수 없는 내리기를 한 번 더 안쪽에 둔다.
export function OwnerMenu({ busy, onEdit, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // 메뉴 밖을 누르거나 Esc 를 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (work: () => void) => {
    setOpen(false)
    work()
  }

  return (
    <div ref={box} className="owner-menu">
      <button type="button" className="icon-btn" aria-label="내 글 메뉴" title="내 글 메뉴" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={busy} onClick={() => setOpen(!open)}>
        <DotsThreeIcon size={22} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className="owner-menu__list" role="menu" aria-label="내 글 메뉴">
          <button type="button" role="menuitem" autoFocus onClick={() => pick(onEdit)}>
            <PencilSimpleIcon size={18} aria-hidden="true" />글 고치기
          </button>
          <button type="button" role="menuitem" data-danger="true" onClick={() => pick(onRemove)}>
            <TrashIcon size={18} aria-hidden="true" />
            피드에서 내리기
          </button>
        </div>
      )}
    </div>
  )
}
