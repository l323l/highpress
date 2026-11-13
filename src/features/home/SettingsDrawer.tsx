import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { XIcon } from '../../components/icons'
import { BACKUP_ACCEPT, exportBackup, importBackup, MAX_BACKUP_BYTES } from '../../db/backup'
import { getSetting, setSetting } from '../../db/store'
import { DEFAULT_THEME, THEME_KEY, type Theme } from '@highpress/core/db'
import { downloadBlob } from '../../lib/download'
import { AccountBar } from '../account'
import { FeedbackForm } from '../feedback/FeedbackForm'
import { BlockedSection } from '../moderation/BlockedSection'

const dateStamp = () => new Date().toISOString().slice(0, 10).replaceAll('-', '')

// 홈 오른쪽에서 열리는 설정창: 화면 밝기, 계정, 차단한 사람, 백업, 약관. 예전의 "관리" 탭이 여기로 왔다.
export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useLiveQuery(() => getSetting<Theme | null>(THEME_KEY, null)) ?? DEFAULT_THEME
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null)

  // 열리면 창 안으로 초점을 옮기고, 닫히면 열기 전에 있던 자리로 돌려준다. Esc 로 닫는다.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const download = async () => {
    try {
      downloadBlob(await exportBackup(), `highpress-backup-${dateStamp()}.zip`)
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : '백업을 내보내지 못했습니다.', error: true })
    }
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage({ text: '백업 파일이 너무 큽니다. 200MB 이하의 파일만 가져올 수 있습니다.', error: true })
      return
    }
    try {
      const { columns: count, skipped } = await importBackup(file, {
        confirmOverwrite: (n) => window.confirm(`이 기기에 있는 칼럼 ${n}편이 백업 내용으로 덮어써집니다. 계속할까요?`),
      })
      setMessage({ text: `칼럼 ${count}편을 가져왔습니다.${skipped ? ` (읽지 못한 항목 ${skipped}개 제외)` : ''}`, error: false })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : '백업을 가져오지 못했습니다.', error: true })
    }
  }

  const themeButton = (value: Theme, label: string) => (
    <button type="button" aria-pressed={theme === value} onClick={() => void setSetting(THEME_KEY, value)}>
      {label}
    </button>
  )

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label="설정" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="drawer-head">
          <h2>설정</h2>
          <button type="button" className="icon-btn" aria-label="설정 닫기" title="닫기" onClick={onClose}>
            <XIcon size={20} aria-hidden="true" />
          </button>
        </header>

        <section className="drawer-section">
          <h3>화면</h3>
          <div className="seg" role="group" aria-label="화면 밝기">
            {themeButton('dark', '어둡게')}
            {themeButton('light', '밝게')}
          </div>
        </section>

        <section className="drawer-section">
          <h3>계정</h3>
          <AccountBar />
        </section>

        {/* 가입을 마친 사람에게만 보인다. */}
        <BlockedSection />

        <section className="drawer-section">
          <h3>피드백</h3>
          <FeedbackForm />
        </section>

        <section className="drawer-section">
          <h3>백업</h3>
          <p className="muted">칼럼과 사진은 이 브라우저에만 있습니다. 파일(ZIP)로 내보내 두면 다른 기기나 브라우저, 휴대폰 앱에서 다시 가져올 수 있습니다.</p>
          <div className="manage-actions">
            <button type="button" className="btn" onClick={download}>
              백업 내보내기
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              백업 가져오기
            </button>
            <input ref={fileInput} type="file" accept={BACKUP_ACCEPT} className="sr-only" tabIndex={-1} aria-label="백업 파일 선택" onChange={upload} />
          </div>
          {message && (
            <p className="home-message" role="status" data-error={message.error}>
              {message.text}
            </p>
          )}
        </section>

        <section className="drawer-section">
          <h3>약관과 고지</h3>
          <p className="muted">서비스가 무엇을 저장하고 무엇을 저장하지 않는지 적어 두었습니다.</p>
          <div className="manage-actions">
            <a className="btn" href="#/terms">
              이용약관
            </a>
            <a className="btn" href="#/privacy">
              개인정보처리방침
            </a>
            <a className="btn" href="#/licenses">
              라이선스
            </a>
          </div>
        </section>
      </aside>
    </div>
  )
}
