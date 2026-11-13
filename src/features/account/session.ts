import { useSyncExternalStore } from 'react'
import { getServer } from '../../lib/supabase'
import { forgetNaverVerifier, NaverAuthError, requestNaverCode } from '../naver/naverAuth'

export interface Profile {
  nickname: string
  // 프로필 사진이 보관함의 어디에 있는지. 없으면 null.
  avatar?: string | null
  // 운영자가 이용을 정지했다 (0014_moderation.sql). 화면은 아직 이 값을 쓰지 않는다.
  suspended?: boolean
}

export type Account =
  // 서버 설정이 없다: 로그인 기능 자체를 보여 주지 않는다.
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'out' }
  | {
      status: 'in'
      userId: string
      email: string
      accessToken: string
      // undefined: 확인 중, null: 아직 약관에 동의하지 않음
      profile: Profile | null | undefined
      // 프로필을 읽지 못했다 (서버 점검·일시정지 등). 앱은 기기 저장으로 계속 동작한다 (SB-9).
      serverDown: boolean
    }

export const NICKNAME_MAX = 30
// 네이버로 가입한 계정의 주소 꼴. 실제 메일 주소가 아니라서 화면에 보여 주지 않는다.
// supabase/functions/_shared/naverAccount.ts 의 ACCOUNT_SUFFIX 와 같은 값이어야 한다.
export const NAVER_ACCOUNT_SUFFIX = '@naver.high-press.workers.dev'

// 화면에 보여 줄 계정 이름. 네이버로 가입한 사람은 메일 주소 대신 "네이버 계정"이라고 적는다.
export const accountLabel = (email: string) => (email.endsWith(NAVER_ACCOUNT_SUFFIX) ? '네이버 계정' : email)
const LOADING_TIMEOUT_MS = 6000

// closed: 가입자 상한, banned: 닉네임에 금칙어, rate: 네이버 로그인을 너무 자주 시도함(서버 429),
// verifier: 네이버 로그인 확인 값이 맞지 않음(서버 400 bad-verifier), failed: 그 밖의 실패
export type AccountErrorCode = 'closed' | 'banned' | 'rate' | 'verifier' | 'failed'

export class AccountError extends Error {
  readonly code: AccountErrorCode

  constructor(code: AccountErrorCode) {
    super(code)
    this.code = code
  }
}

let state: Account = getServer() ? { status: 'loading' } : { status: 'off' }
let started = false
const listeners = new Set<() => void>()

function set(next: Account): void {
  state = next
  for (const listener of listeners) listener()
}

export function getAccount(): Account {
  return state
}

export function useAccount(): Account {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

type ProfileRow = { nickname: unknown; avatar?: unknown; suspended?: unknown }
type ProfileRead = { data: ProfileRow | null; error: { code?: string; message: string } | null }

// 서버에 my_profile() 이 아직 없다 (PGRST202: 함수를 찾지 못함, 42883: 그런 함수 없음).
const noMyProfile = (error: { code?: string } | null) => error !== null && ['PGRST202', '42883'].includes(error.code ?? '')

// 내 프로필 한 줄. 서버가 profiles 의 bio · avatar 를 직접 읽지 못하게 막았으므로 본인 것은 함수 my_profile() 로 읽는다 (보안 점검 L1).
async function readMyProfile(server: NonNullable<Awaited<ReturnType<typeof getServer>>>, userId: string): Promise<ProfileRead> {
  const { data, error } = await server.rpc('my_profile')
  if (!error) return { data: ((data ?? []) as ProfileRow[])[0] ?? null, error: null }
  if (!noMyProfile(error)) return { data: null, error }
  // 예전 서버: 표에서 읽는다. 프로필 사진 칸이 아직 없으면(0011_avatar.sql 전) 닉네임만 읽는다.
  let read: ProfileRead = await server.from('profiles').select('nickname, avatar').eq('user_id', userId).maybeSingle<ProfileRow>()
  if (read.error) read = await server.from('profiles').select('nickname').eq('user_id', userId).maybeSingle<ProfileRow>()
  return read
}

async function loadProfile(userId: string): Promise<void> {
  const server = await getServer()
  if (!server) return
  // 여기서 실패하면 로그인한 것으로 보이지 않는다.
  const { data, error } = await readMyProfile(server, userId)
  // 그사이 로그아웃했거나 다른 계정이 됐으면 버린다.
  if (state.status !== 'in' || state.userId !== userId) return
  if (error) set({ ...state, profile: undefined, serverDown: true })
  else
    set({
      ...state,
      profile: data ? { nickname: String(data.nickname ?? ''), avatar: typeof data.avatar === 'string' && data.avatar ? data.avatar : null, suspended: data.suspended === true } : null,
      serverDown: false,
    })
}

// 프로필 사진을 바꾼 뒤, 맨 위 줄의 내 사진도 바로 바뀌게 한다.
export function setMyAvatar(avatar: string | null): void {
  if (state.status === 'in' && state.profile) set({ ...state, profile: { ...state.profile, avatar } })
}

// 로그인 상태를 지켜보기 시작한다. 여러 번 불러도 한 번만 연결한다.
export function startAccount(): void {
  const pending = getServer()
  if (!pending || started) return
  started = true
  // 확인이 끝나지 않으면(다른 탭이 로그인 정보를 붙잡고 있는 경우 등) 로그인 버튼이라도 보여 준다.
  setTimeout(() => {
    if (state.status === 'loading') set({ status: 'out' })
  }, LOADING_TIMEOUT_MS)
  void pending
    .then((server) => {
      server.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          set({ status: 'out' })
          return
        }
        const sameUser = state.status === 'in' && state.userId === session.user.id
        set({
          status: 'in',
          userId: session.user.id,
          email: session.user.email ?? '',
          accessToken: session.access_token,
          profile: sameUser && state.status === 'in' ? state.profile : undefined,
          serverDown: sameUser && state.status === 'in' ? state.serverDown : false,
        })
        // 이 콜백 안에서는 오래 걸리는 일을 하지 않는다. 프로필은 밖에서 읽는다.
        if (!sameUser) setTimeout(() => void loadProfile(session.user.id), 0)
      })
    })
    .catch(() => set({ status: 'out' }))
}

// 로그인하러 나가기 전에 보던 화면의 주소를 적어 두는 자리 (이 탭에서만 남는다)
export const RETURN_KEY = 'hp:return'

export async function signIn(): Promise<void> {
  const server = await getServer()
  if (!server) return
  try {
    window.sessionStorage.setItem(RETURN_KEY, window.location.hash)
  } catch {
    // 적어 두지 못하면 로그인 뒤 홈으로 돌아올 뿐이다.
  }
  // 로그인 뒤 지금 보던 앱 주소로 돌아온다. 작성 중인 글은 이미 기기에 저장돼 있다.
  const { error } = await server.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })
  if (error) throw new AccountError('failed')
}

// 네이버로 가입 · 로그인 (A-10). 네이버 로그인 창(팝업)에서 확인을 받으면 서버 함수가 한 번 쓰는 로그인 표를 내준다.
// 창을 닫았거나 팝업이 막혔으면 NaverAuthError, 그 밖의 실패는 AccountError 를 던진다.
// 버튼을 누른 처리 안에서 바로 불러야 한다 (기다린 뒤에 창을 띄우면 팝업이 막힌다).
export async function signInWithNaver(): Promise<void> {
  const pending = getServer()
  if (!pending) return
  const asked = requestNaverCode()
  // verifier: 가로챈 코드만으로는 로그인하지 못하게 서버가 state 와 맞춰 보는 값 (A1-6)
  const { code, state, verifier } = await asked
  // 한 번 보낸 verifier 는 다시 쓰지 않는다. 보내지 못했을 때도 지운다.
  const server = await pending.catch((cause: unknown) => {
    forgetNaverVerifier()
    throw cause
  })
  const { data, error } = await server.functions.invoke('naver-login', { body: { code, state, verifier } }).finally(forgetNaverVerifier)
  if (error) throw new AccountError(await naverLoginProblem(error))
  const tokenHash = (data as { tokenHash?: unknown } | null)?.tokenHash
  if (typeof tokenHash !== 'string' || !tokenHash) throw new AccountError('failed')
  let verified = await server.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  // 서버 버전에 따라 로그인 표의 종류를 예전 이름으로만 받는 경우가 있다.
  if (verified.error) verified = await server.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (verified.error || !verified.data.session) throw new AccountError('failed')
}

// 서버 함수가 거절한 이유는 응답 본문({ error })과 상태 번호에 있다.
async function naverLoginProblem(error: unknown): Promise<AccountErrorCode> {
  const response = (error as { context?: Response } | null)?.context
  const reply = response && typeof response.json === 'function' ? ((await response.json().catch(() => null)) as { error?: unknown } | null) : null
  const code = String(reply?.error ?? '')
  if (code === 'bad-verifier') return 'verifier'
  if (code === 'rate' || response?.status === 429) return 'rate'
  return 'failed'
}

export { NaverAuthError }

export async function signOut(): Promise<void> {
  const server = await getServer()
  await server?.auth.signOut()
}

// 약관에 동의하고 프로필을 만든다 (A-5). 가입자 상한에 걸리면 'closed'.
export async function agree(nickname: string): Promise<void> {
  const server = await getServer()
  if (!server || state.status !== 'in') throw new AccountError('failed')
  const userId = state.userId
  const { error } = await server.from('profiles').insert({ nickname: nickname.trim().slice(0, NICKNAME_MAX) })
  if (error) throw new AccountError(error.message.includes('signup_closed') ? 'closed' : /banned_word/.test(error.message) ? 'banned' : 'failed')
  await loadProfile(userId)
}

// 서버의 계정과 초안을 지운다 (A-3). 이 기기에 저장한 칼럼은 그대로 남는다 (A-9).
// 사진(대표 사진 · 프로필 사진) → 계정 순서는 서버 함수(account-delete)가 한곳에서 처리한다 (APP-PLAN A1-7).
// 로그인 토큰은 supabase-js 가 함수 호출에 붙여 보낸다.
export async function deleteAccount(): Promise<void> {
  const server = await getServer()
  if (!server) return
  const { data, error } = await server.functions.invoke('account-delete', { method: 'POST', body: {} })
  if (error || (data as { ok?: unknown } | null)?.ok !== true) throw new AccountError('failed')
  await server.auth.signOut({ scope: 'local' })
}

// 서버 함수를 부를 때 쓰는 로그인 토큰. 로그인하지 않았으면 null.
export function accessToken(): string | null {
  return state.status === 'in' ? state.accessToken : null
}

// 초안 동기화를 해도 되는 상태인지: 로그인했고 약관에 동의했다.
export function canSync(account: Account): boolean {
  return account.status === 'in' && account.profile !== null && account.profile !== undefined
}
