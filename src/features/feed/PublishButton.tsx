import { useEffect, useId, useMemo, useState } from 'react'
import { db } from '../../db/db'
import { CLUBS, LEAGUES, clubOf } from '../../lib/clubs'
import { canSync, useAccount } from '../account'
import { columnImages, type CoverChoice } from './cover'
import { LoginNote } from './LoginNote'
import { publishColumn } from './publish'
import { publishErrorText } from '@highpress/core/feed'

interface Props {
  columnId: string
  // 올리기 전에 할 일 (글쓰기 화면의 저장). false 를 주면 올리지 않는다.
  prepare?: () => Promise<boolean>
  className?: string
  // 확인 창이 버튼의 어느 쪽 끝에 맞춰 열리는지
  align?: 'start' | 'end'
}

// 칼럼을 피드에 올린다. 버튼은 누구에게나 보이지만, 올리는 것은 로그인하고 약관에 동의한 사람만 한다.
export function PublishButton({ columnId, prepare, className = 'btn', align = 'end' }: Props) {
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [club, setClub] = useState('')
  // 본문의 사진들과 그중 대표 사진으로 고른 것 (빈 글자: 사진 없이)
  const [images, setImages] = useState<CoverChoice[]>([])
  const [cover, setCover] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const selectId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 고르는 창에 보일 작은 그림. 창이 닫히거나 사진 목록이 바뀌면 주소를 돌려준다.
  const thumbs = useMemo(() => (open ? images.map((image) => ({ ...image, url: URL.createObjectURL(image.blob) })) : []), [open, images])
  useEffect(() => () => thumbs.forEach((thumb) => URL.revokeObjectURL(thumb.url)), [thumbs])

  // 서버 설정이 없으면 피드도 없다.
  if (account.status === 'off') return null
  const member = canSync(account)

  const toggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setNote(null)
    // 로그인하지 않았으면 올리는 창 대신 로그인 안내를 연다.
    if (!member) {
      setOpen(true)
      return
    }
    // 지난번에 고른 구단을 그대로 보여 준다.
    const column = await db.columns.get(columnId)
    setClub(clubOf(column?.feedClub)?.id ?? '')
    const found = await columnImages(columnId).catch(() => [])
    setImages(found)
    // 지난번에 고른 사진이 아직 본문에 있으면 그대로, "사진 없이"를 골랐었으면 그대로, 아니면 첫 사진.
    const last = column?.feedCover
    setCover(last === '' ? '' : (found.find((image) => image.mediaId === last)?.mediaId ?? found[0]?.mediaId ?? ''))
    setOpen(true)
  }

  const publish = async () => {
    setBusy(true)
    try {
      if (prepare && !(await prepare())) throw new Error('not saved')
      await publishColumn(columnId, club || null, cover || null)
      // 수정 시각을 바꾸지 않도록 이 칸들만 따로 적는다.
      await db.columns.update(columnId, { feedClub: club || null, feedCover: images.length > 0 ? cover : null })
      setNote({ text: '피드에 올렸습니다.', error: false })
    } catch (cause) {
      setNote({ text: publishErrorText(cause), error: true })
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <span className="publish" data-align={align}>
      <button type="button" className={className} disabled={busy} aria-expanded={open} onClick={() => void toggle()}>
        피드에 올리기
      </button>
      {open && !member && (
        <div className="publish-panel" role="group" aria-label="피드에 올리기">
          <LoginNote what="피드에 올리기는" onClose={() => setOpen(false)} />
        </div>
      )}
      {open && member && (
        <div className="publish-panel" role="group" aria-label="피드에 올리기">
          <p>로그인하지 않은 사람을 포함해 누구나 글과 스탯 표, 고른 대표 사진 한 장을 볼 수 있습니다. 나머지 사진과 영상은 올라가지 않습니다.</p>
          <label className="publish-field" htmlFor={selectId}>
            <span>구단</span>
            <select id={selectId} className="field" value={club} onChange={(event) => setClub(event.target.value)}>
              <option value="">없음</option>
              {LEAGUES.map((league) => (
                <optgroup key={league} label={league}>
                  {CLUBS.filter((item) => item.league === league).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="publish-field">
            <span id={`${selectId}-cover`}>대표 사진</span>
            {thumbs.length === 0 ? (
              <span className="publish-hint muted">본문에 사진을 넣으면 그중 한 장을 대표 사진으로 올릴 수 있습니다.</span>
            ) : (
              <>
                <div className="publish-covers" role="group" aria-labelledby={`${selectId}-cover`}>
                  {thumbs.map((thumb, index) => (
                    <button key={thumb.mediaId} type="button" className="publish-cover" aria-pressed={cover === thumb.mediaId} aria-label={`${index + 1}번째 사진`} title={thumb.name} onClick={() => setCover(thumb.mediaId)}>
                      <img src={thumb.url} alt="" />
                    </button>
                  ))}
                  <button type="button" className="publish-cover publish-cover--none" aria-pressed={cover === ''} onClick={() => setCover('')}>
                    사진 없이
                  </button>
                </div>
                <span className="publish-hint muted">사진은 작게 줄여서 올립니다. 남의 사진을 쓰는 책임은 올리는 사람에게 있습니다.</span>
              </>
            )}
          </div>
          <div className="publish-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
              올리기
            </button>
          </div>
        </div>
      )}
      {note && !open && (
        <span className="publish-note" role={note.error ? 'alert' : 'status'} data-error={note.error || undefined}>
          {note.text}
        </span>
      )}
    </span>
  )
}
