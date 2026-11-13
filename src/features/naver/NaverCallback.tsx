import { useEffect } from 'react'
import { NAVER_CHANNEL, type NaverCallbackMessage } from './naverAuth'

// 네이버 로그인 창이 돌아오는 화면. 받은 결과를 글쓰기 창에 알려 주고 스스로 닫는다.
// 여기서는 코드를 토큰으로 바꾸지 않는다. 글쓰기 창이 자기가 보낸 요청인지(state) 확인한 뒤에 바꾼다.
export function NaverCallback() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const message: NaverCallbackMessage = { state: query.get('state') ?? '', code: query.get('code') ?? '', error: query.get('error') ?? '' }
    const channel = new BroadcastChannel(NAVER_CHANNEL)
    channel.postMessage(message)
    channel.close()
    // 주소창에 로그인 코드가 남지 않게 지운다.
    window.history.replaceState(null, '', window.location.pathname)
    window.close()
  }, [])

  return (
    <main className="editor-message">
      <p>네이버 로그인을 마쳤습니다. 이 창은 닫아도 됩니다.</p>
    </main>
  )
}
