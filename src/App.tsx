import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { getSetting } from './db/store'
import { DEFAULT_THEME, THEME_KEY, type Theme } from '@highpress/core/db'
import { AdminPage, canSync, startAccount, useAccount } from './features/account'
import { EditorPage } from './features/editor'
import { usePresence } from './features/feed'
import { HomePage } from './features/home'
import { DeleteAccountPage, LicensesPage, PrivacyPage, TermsPage } from './features/legal'
import { PostPage } from './features/post'
import { ProfilePage } from './features/profile'
import { useDraftSync } from './features/sync'
import { LoginDialog } from './features/account/LoginDialog'
import { RETURN_KEY } from './features/account/session'
import { useRoute } from './lib/router'
import { countVisit } from './lib/visit'

export default function App() {
  const route = useRoute()
  const theme = useLiveQuery(() => getSetting<Theme | null>(THEME_KEY, null))

  useEffect(() => {
    // 따로 고르지 않았으면 어두운 화면으로 연다. 설정창에서 밝게 바꿀 수 있다.
    document.documentElement.dataset.theme = theme ?? DEFAULT_THEME
  }, [theme])

  // 서버 설정이 있을 때만 로그인 상태를 지켜보고, 약관에 동의한 사용자만 초안을 동기화한다.
  const account = useAccount()
  useEffect(startAccount, [])
  useDraftSync(account.status === 'in' && canSync(account) ? account.userId : null)
  usePresence(canSync(account))
  // 로그인과 상관없이 오늘 이 브라우저를 한 번 센다 (운영 현황의 하루 방문자).
  useEffect(() => {
    void countVisit()
  }, [])

  // 로그인하러 나갔다 돌아오면 보던 화면(글 · 프로필)으로 되돌린다. 로그인은 늘 앱의 첫 주소로 돌아오기 때문이다.
  const signedIn = account.status === 'in'
  useEffect(() => {
    if (!signedIn) return
    try {
      const back = window.sessionStorage.getItem(RETURN_KEY)
      window.sessionStorage.removeItem(RETURN_KEY)
      if (back && /^#\/(p|u)\/[\w/-]+$/.test(back) && window.location.hash !== back) window.location.hash = back
    } catch {
      // 저장소를 쓸 수 없으면 홈에 머문다.
    }
  }, [signedIn])

  const page = () => {
    if (route.name === 'write') return <EditorPage key={route.id} columnId={route.id} />
    if (route.name === 'licenses') return <LicensesPage />
    if (route.name === 'terms') return <TermsPage />
    if (route.name === 'privacy') return <PrivacyPage />
    if (route.name === 'delete-account') return <DeleteAccountPage />
    if (route.name === 'admin') return <AdminPage />
    if (route.name === 'post') return <PostPage author={route.author} postId={route.id} />
    if (route.name === 'profile') return <ProfilePage key={route.id} userId={route.id} />
    // 다른 화면에서 검색해 넘어오면 그 말로 찾은 피드부터 보여 준다.
    return <HomePage key={route.q ?? ''} initialQuery={route.q} />
  }

  // 어느 화면에서든 "로그인 · 가입"을 누르면 같은 창이 뜬다.
  return (
    <>
      {page()}
      <LoginDialog />
    </>
  )
}
