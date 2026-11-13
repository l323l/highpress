import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles/app.css'
import App from './App.tsx'
import { NaverCallback } from './features/naver/NaverCallback'
import { NAVER_CALLBACK_PATH } from './features/naver/naverAuth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 네이버 로그인 창이 돌아오는 주소에서는 앱을 띄우지 않고 결과만 전한다. */}
    {window.location.pathname === NAVER_CALLBACK_PATH ? <NaverCallback /> : <App />}
  </StrictMode>,
)
