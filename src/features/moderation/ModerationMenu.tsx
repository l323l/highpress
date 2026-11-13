import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { DotsThreeIcon, FlagIcon, ImageIcon, ProhibitIcon } from '../../components/icons'
import { useAccount } from '../account'
import { openLogin } from '../account/loginPrompt'
import { LoginNote } from '../feed/LoginNote'
import { BlockDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { ReportSheet, type ReportTarget } from './ReportSheet'
import './moderation.css'

interface Props {
  // 로그인하고 가입을 마친 사용자의 id. 아니면 빈 글자.
  me: string
  // ⋯ 단추의 이름 (예: "빌드업 님의 글 메뉴")
  label: string
  // 신고할 수 있는 것들. 하나마다 메뉴 줄이 하나 생긴다 (글, 대표 사진처럼).
  reports: ReportTarget[]
  // 차단할 사람
  person: { userId: string; name: string }
  // 차단한 뒤 목록을 새로 읽는 일
  onBlocked?: (userId: string) => void
  // 댓글 줄처럼 작은 단추가 늘어선 자리에서는 그 줄의 단추 모양을 따른다.
  variant?: 'icon' | 'thread'
}

type Open = { type: 'report'; target: ReportTarget } | { type: 'block' } | { type: 'ask'; what: string } | null

// 남의 글 · 댓글 · 프로필에 붙는 "⋯" 메뉴: 신고하기와 차단하기. 내 것에는 붙이지 않는다.
// 로그인하지 않았으면 로그인 창을, 로그인했지만 가입을 마치지 않았으면 그 안내를 띄운다.
export function ModerationMenu({ me, label, reports, person, onBlocked, variant = 'icon' }: Props) {
  const account = useAccount()
  const [menu, setMenu] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // 메뉴 밖을 누르면 닫는다. Esc 는 메뉴 안의 키 처리에서 닫고 단추로 초점을 돌린다.
  useEffect(() => {
    if (!menu) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [menu])

  const pick = (next: Exclude<Open, null>, what: string) => {
    setMenu(false)
    if (me) {
      setOpen(next)
      return
    }
    // 로그인 창이 따로 있으니 거기로 보낸다. 가입을 마치지 않은 사람에게는 로그인 창이 뜨지 않으므로 안내를 보인다.
    if (account.status === 'out') {
      trigger.current?.focus()
      openLogin()
    } else setOpen({ type: 'ask', what })
  }

  // 위아래 화살표로 메뉴 줄을 옮겨 다닌다. Esc 는 닫고 단추로 돌아간다.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const move = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setMenu(false)
      trigger.current?.focus()
    } else if (event.key === 'Tab') setMenu(false)
  }

  const close = () => setOpen(null)

  return (
    <div ref={box} className="mod-menu" data-variant={variant}>
      <button
        ref={trigger}
        type="button"
        className={variant === 'thread' ? 'thread-action mod-menu__trigger' : 'icon-btn mod-menu__trigger'}
        aria-label={label}
        title="더 보기"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-controls={menu ? menuId : undefined}
        // 계정을 확인하는 동안에는 내 것인지 모르므로 열지 않는다.
        disabled={account.status === 'loading'}
        onClick={() => setMenu(!menu)}
      >
        <DotsThreeIcon size={variant === 'thread' ? 18 : 22} weight="bold" aria-hidden="true" />
      </button>
      {menu && (
        <div ref={list} id={menuId} className="mod-menu__list" role="menu" aria-label={label} onKeyDown={onKey}>
          {reports.map((target, index) => (
            <button key={`${target.kind}:${target.part ?? ''}`} type="button" role="menuitem" autoFocus={index === 0} onClick={() => pick({ type: 'report', target }, '신고는')}>
              {target.part ? <ImageIcon size={18} aria-hidden="true" /> : <FlagIcon size={18} aria-hidden="true" />}
              {/* 약관이 "⋯ 메뉴 → 신고하기"로 설명한다. 사진만 따로 신고하는 줄에만 무엇인지 붙인다. */}
              {target.part ? `${target.label} 신고하기` : '신고하기'}
            </button>
          ))}
          <button type="button" role="menuitem" data-danger="true" autoFocus={reports.length === 0} onClick={() => pick({ type: 'block' }, '차단은')}>
            <ProhibitIcon size={18} aria-hidden="true" />
            차단하기
          </button>
        </div>
      )}

      {open?.type === 'report' && <ReportSheet target={open.target} onClose={close} returnTo={trigger} />}
      {open?.type === 'block' && <BlockDialog userId={person.userId} name={person.name} returnTo={trigger} onClose={close} onBlocked={(userId) => onBlocked?.(userId)} />}
      {open?.type === 'ask' && (
        <Dialog title="가입을 마친 뒤 쓸 수 있습니다" onClose={close} returnTo={trigger}>
          <LoginNote what={open.what} onClose={close} />
        </Dialog>
      )}
    </div>
  )
}
