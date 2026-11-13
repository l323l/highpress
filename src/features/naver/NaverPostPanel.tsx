import type { Editor } from '@tiptap/react'
import { useEffect, useId, useRef, useState } from 'react'
import { db } from '../../db/db'
import { canSync, useAccount } from '../account'
import { TabGuide } from '../editor/TabGuide'
import { parseCafeBoard, recentTargets, rememberTarget, targetLabel, type CafeTarget } from './cafeTarget'
import { forgetNaver, loginNaver, NaverAuthError, naverReady, naverToken } from './naverAuth'
import { naverPostErrorText, NaverPostError } from '@highpress/core/naver'
import { postToCafe } from './naverPost'

function loginErrorText(error: NaverAuthError): string {
  if (error.problem === 'popup') return '네이버 로그인 창을 열지 못했습니다. 주소창에서 팝업 차단을 풀고 다시 눌러 주세요.'
  if (error.problem === 'cancelled') return '네이버 로그인을 마치지 않았습니다. 다시 눌러 로그인해 주세요.'
  return '네이버 로그인을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}

// 내보내기 창 안의 "네이버 카페에 바로 올리기". 서버에 네이버 설정이 있고 로그인한 가입자에게만 보인다.
export function NaverPostPanel({ editor, columnId }: { editor: Editor | null; columnId: string }) {
  const account = useAccount()
  const [recents, setRecents] = useState<CafeTarget[]>([])
  // 전에 올렸던 곳 가운데 고른 것. 주소를 새로 적으면 그 주소가 먼저다.
  const [picked, setPicked] = useState<CafeTarget | null>(null)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean; url?: string } | null>(null)
  const running = useRef(false)
  const addressId = useId()
  const shown = naverReady() && canSync(account)

  useEffect(() => {
    if (!shown) return
    let cancelled = false
    void recentTargets().then((targets) => {
      if (cancelled) return
      setRecents(targets)
      setPicked((current) => current ?? targets[0] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [shown])

  if (!shown) return null

  const typed = address.trim() ? parseCafeBoard(address) : null
  const badAddress = address.trim() !== '' && !typed
  const target = typed ?? (address.trim() ? null : picked)

  const post = async () => {
    if (!editor || !target || running.current) return
    running.current = true
    setBusy(true)
    setNotice(null)
    try {
      // 팝업이 막히지 않게, 다른 일을 기다리기 전에 로그인 창부터 연다.
      const token = await loginNaver()
      const column = await db.columns.get(columnId)
      const url = await postToCafe({ columnId, html: editor.getHTML(), title: column?.title ?? '', target, token })
      const saved: CafeTarget = { clubId: target.clubId, menuId: target.menuId, label: targetLabel(target) }
      await rememberTarget(saved)
      setRecents(await recentTargets())
      setPicked(saved)
      setAddress('')
      setNotice({ text: '네이버 카페에 올렸습니다.', error: false, url })
    } catch (error) {
      // 네이버가 로그인을 받지 않았으면 받아 둔 토큰을 버려, 다음에 다시 로그인하게 한다.
      if (error instanceof NaverPostError && error.problem === 'login') forgetNaver()
      setNotice({ text: error instanceof NaverAuthError ? loginErrorText(error) : naverPostErrorText(error), error: true })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <section className="naver-post" aria-label="네이버 카페에 바로 올리기">
      <h3 className="naver-post__title">네이버 카페에 바로 올리기</h3>
      <p className="export__hint">
        글과 표는 서식 그대로 올라갑니다. 사진은 글 맨 위에 순서대로 붙으니, 올린 뒤 카페에서 본문의 <b>[사진 번호]</b> 자리로 옮겨 주세요. 영상은 올라가지 않습니다.
      </p>
      {recents.length > 0 && (
        <div className="naver-post__recents" role="group" aria-label="전에 올린 곳">
          {recents.map((item) => (
            <button
              key={`${item.clubId}/${item.menuId}`}
              type="button"
              className="chip"
              aria-pressed={!address.trim() && picked?.clubId === item.clubId && picked.menuId === item.menuId}
              onClick={() => {
                setPicked(item)
                setAddress('')
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <label className="naver-post__field" htmlFor={addressId}>
        <span>{recents.length > 0 ? '다른 게시판 주소' : '게시판 주소'}</span>
        <input
          id={addressId}
          className="field"
          type="url"
          inputMode="url"
          placeholder="카페에서 글을 올릴 게시판을 열고 주소를 붙여 넣으세요"
          value={address}
          maxLength={500}
          aria-invalid={badAddress}
          onChange={(event) => setAddress(event.target.value)}
        />
      </label>
      {badAddress && (
        <p className="export__notice export__notice--error" role="alert">
          게시판 주소를 읽지 못했습니다. PC에서 카페의 게시판을 누른 뒤 주소창의 주소(…/cafes/숫자/menus/숫자)를 붙여 넣어 주세요.
        </p>
      )}
      <div className="export__buttons">
        {/* 네이버 로그인이 필요한 동안에는 네이버 로그인 단추 모양(초록 바탕, N)을 쓴다. */}
        <button type="button" className="btn naver-button" disabled={busy || !editor || !target} onClick={() => void post()}>
          <span className="naver-button__n" aria-hidden="true">
            N
          </span>
          {busy ? '올리는 중…' : naverToken() ? '네이버 카페에 올리기' : '네이버 로그인하고 카페에 올리기'}
        </button>
      </div>
      <p className="muted naver-post__small">처음 누르면 네이버 로그인 창이 열립니다. 동의 화면에서 “카페 글쓰기”를 선택해 주세요. 글은 로그인한 네이버 계정의 이름으로 올라갑니다.</p>
      {/* 처음 볼 때 한 번, 유의할 점을 알린다. */}
      <TabGuide tab="naver" />
      {notice && (
        <p className={notice.error ? 'export__notice export__notice--error' : 'export__notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}{' '}
          {notice.url && (
            <a href={notice.url} target="_blank" rel="noopener noreferrer">
              올린 글 보기
            </a>
          )}
        </p>
      )}
    </section>
  )
}
