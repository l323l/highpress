import { getServer } from '../../lib/supabase'

// 네이버 개발자센터에 등록한 애플리케이션의 Client ID (공개되는 값). 없으면 직접 게시를 보여 주지 않는다.
const CLIENT_ID: string = import.meta.env.VITE_NAVER_CLIENT_ID ?? ''
// 로그인 창(팝업)이 결과를 알려 주는 통로. 같은 주소의 창끼리만 들을 수 있다.
export const NAVER_CHANNEL = 'hp-naver-auth'
export const NAVER_CALLBACK_PATH = '/naver-callback'

// popup: 팝업이 막힘, cancelled: 창을 닫거나 동의하지 않음, state: 다른 곳에서 온 응답, failed: 그 밖의 실패
export type NaverAuthProblem = 'popup' | 'cancelled' | 'state' | 'failed'

export class NaverAuthError extends Error {
  readonly problem: NaverAuthProblem

  constructor(problem: NaverAuthProblem) {
    super(problem)
    this.problem = problem
  }
}

export const naverReady = () => CLIENT_ID !== ''

// 토큰은 이 탭의 메모리에만 둔다 (SEC-6). 저장소에도 서버에도 적지 않는다. 탭을 닫으면 사라진다.
let session: { token: string; expiresAt: number } | null = null

export const naverToken = () => (session && session.expiresAt > Date.now() + 60_000 ? session.token : null)

export function forgetNaver(): void {
  session = null
}

export interface NaverCallbackMessage {
  state: string
  code: string
  error: string
}

// 로그인 코드를 가로챈 사람이 그 코드만으로 로그인하지 못하게 하는 값 (APP-PRD 8.2, APP-PLAN 4.5).
// 시작할 때 무작위 verifier 를 만들고 state = base64url(SHA-256(verifier)) 로 둔다. 서버(naver-login)가 둘이 맞는지 확인한다.
// verifier 는 로그인 창이 돌아올 때까지 이 탭의 sessionStorage 에만 두고, 서버에 보낸 뒤 지운다.
export const NAVER_VERIFIER_KEY = 'hp:naver-verifier'

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// 32바이트 무작위 값 → base64url 43자
export const makeVerifier = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

export async function stateFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

// 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)에서는 메모리에 둔 값으로 이어 간다.
let pendingVerifier: string | null = null

function keepVerifier(verifier: string): void {
  pendingVerifier = verifier
  try {
    window.sessionStorage.setItem(NAVER_VERIFIER_KEY, verifier)
  } catch {
    // 메모리의 값을 쓴다.
  }
}

function keptVerifier(): string | null {
  try {
    return window.sessionStorage.getItem(NAVER_VERIFIER_KEY) ?? pendingVerifier
  } catch {
    return pendingVerifier
  }
}

// 서버에 보냈거나 로그인을 그만두면 지운다.
export function forgetNaverVerifier(): void {
  pendingVerifier = null
  try {
    window.sessionStorage.removeItem(NAVER_VERIFIER_KEY)
  } catch {
    // 지울 저장소가 없다.
  }
}

// 로그인 창에서 결과가 오기를 기다린다. 창이 닫히면 취소로 본다.
function waitForCallback(popup: Window, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(NAVER_CHANNEL)
    let done = false
    const finish = (settle: () => void) => {
      if (done) return
      done = true
      channel.close()
      window.clearInterval(watch)
      window.clearTimeout(limit)
      settle()
    }
    // 창이 닫힌 직후에 도착하는 결과를 놓치지 않게 조금 기다렸다가 취소로 본다.
    const watch = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish(() => reject(new NaverAuthError('cancelled'))), 800)
    }, 500)
    const limit = window.setTimeout(() => finish(() => reject(new NaverAuthError('cancelled'))), 5 * 60_000)
    channel.onmessage = (event: MessageEvent<NaverCallbackMessage>) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      // 우리가 보낸 요청에 대한 응답만 받는다.
      if (message.state !== state) return finish(() => reject(new NaverAuthError('state')))
      if (message.error || !message.code) return finish(() => reject(new NaverAuthError('cancelled')))
      finish(() => resolve(message.code))
    }
  })
}

// 네이버 로그인 창을 띄워 로그인 코드를 받는다. 카페에 올리기와 네이버로 가입 · 로그인이 함께 쓴다.
// 팝업이 막히지 않도록, 버튼을 누른 처리 안에서 기다림 없이 바로 불러야 한다.
// 돌려준 verifier 를 다 쓰면 forgetNaverVerifier() 로 지운다. 실패하면 여기서 지운다.
export async function requestNaverCode(): Promise<{ code: string; state: string; verifier: string }> {
  // state 를 만드는 데 기다림(SHA-256)이 들어가므로, 창을 먼저 빈 화면으로 열고 주소는 그 뒤에 넣는다.
  const popup = window.open('', 'hp-naver-login', 'width=520,height=760')
  if (!popup) throw new NaverAuthError('popup')
  const verifier = makeVerifier()
  keepVerifier(verifier)
  try {
    const state = await stateFor(verifier)
    const authorize = new URL('https://nid.naver.com/oauth2.0/authorize')
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: `${window.location.origin}${NAVER_CALLBACK_PATH}`, state }).toString()
    popup.location.href = authorize.toString()
    const code = await waitForCallback(popup, state)
    return { code, state, verifier: keptVerifier() ?? verifier }
  } catch (cause) {
    forgetNaverVerifier()
    if (!popup.closed) popup.close()
    throw cause instanceof NaverAuthError ? cause : new NaverAuthError('failed')
  }
}

// 네이버 로그인 창을 띄워 토큰을 받는다. 이미 받은 토큰이 살아 있으면 그대로 쓴다.
export async function loginNaver(): Promise<string> {
  const current = naverToken()
  if (current) return current
  const { code, state, verifier } = await requestNaverCode()
  // Client Secret 이 필요한 교환은 서버 함수가 한다. 카페 올리기(naver 함수)도 verifier 의 해시가 state 와 맞는지 확인한다 (400 bad-verifier).
  // 한 번 보낸 verifier 는 다시 쓰지 않는다. 보내지 못했을 때도 지운다.
  const { data, error } = await (async () => {
    try {
      const server = await getServer()
      if (!server) throw new NaverAuthError('failed')
      return await server.functions.invoke('naver', { body: { code, state, verifier } })
    } finally {
      forgetNaverVerifier()
    }
  })()
  const reply = data as { token?: unknown; expiresIn?: unknown } | null
  if (error || typeof reply?.token !== 'string' || !reply.token) throw new NaverAuthError('failed')
  session = { token: reply.token, expiresAt: Date.now() + (Number(reply.expiresIn) || 3600) * 1000 }
  return reply.token
}
