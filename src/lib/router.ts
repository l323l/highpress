import { useSyncExternalStore } from 'react'

// home 의 q: 다른 화면의 검색창에서 넘어온 검색어
export type Route = { name: 'home'; q?: string } | { name: 'write'; id: string } | { name: 'licenses' } | { name: 'terms' } | { name: 'privacy' } | { name: 'delete-account' } | { name: 'admin' } | { name: 'profile'; id: string } | { name: 'post'; author: string; id: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const search = /^\/\?q=(.+)$/.exec(path)
  if (search) {
    try {
      const q = decodeURIComponent(search[1]).trim().slice(0, 50)
      if (q) return { name: 'home', q }
    } catch {
      // 깨진 주소는 그냥 홈으로 본다.
    }
    return { name: 'home' }
  }
  const write = /^\/write\/([\w-]+)$/.exec(path)
  if (write) return { name: 'write', id: write[1] }
  const profile = /^\/u\/([\w-]{1,64})$/.exec(path)
  if (profile) return { name: 'profile', id: profile[1] }
  // 글 한 편: 글쓴이와 글의 id. 글쓴이를 함께 두어 그 사람의 글 목록에서 찾는다.
  const post = /^\/p\/([\w-]{1,64})\/([\w-]{1,64})$/.exec(path)
  if (post) return { name: 'post', author: post[1], id: post[2] }
  if (path === '/licenses') return { name: 'licenses' }
  if (path === '/terms') return { name: 'terms' }
  if (path === '/privacy') return { name: 'privacy' }
  // 계정 삭제 안내: 로그인하지 않아도 보이는 화면 (스토어에 적는 주소)
  if (path === '/delete-account') return { name: 'delete-account' }
  if (path === '/admin') return { name: 'admin' }
  return { name: 'home' }
}

// 주소에 넣는 id 의 형식 (parseHash 가 받는 것과 같다). 서버에서 온 값이 이 꼴이 아니면 주소를 만들지 않고 홈으로 보낸다.
const SAFE_ID = /^[\w-]{1,64}$/
const safe = (...ids: string[]) => ids.every((id) => typeof id === 'string' && SAFE_ID.test(id))

export function toHash(route: Route): string {
  if (route.name === 'write') return safe(route.id) ? `#/write/${route.id}` : '#/'
  if (route.name === 'profile') return safe(route.id) ? `#/u/${route.id}` : '#/'
  if (route.name === 'post') return safe(route.author, route.id) ? `#/p/${route.author}/${route.id}` : '#/'
  if (route.name === 'licenses') return '#/licenses'
  if (route.name === 'terms') return '#/terms'
  if (route.name === 'privacy') return '#/privacy'
  if (route.name === 'delete-account') return '#/delete-account'
  if (route.name === 'admin') return '#/admin'
  if (route.name === 'home' && route.q) return `#/?q=${encodeURIComponent(route.q)}`
  return '#/'
}

export function navigate(route: Route): void {
  window.location.hash = toHash(route)
}

// 앱 안에서 화면을 옮긴 횟수. 주소로 바로 들어왔는지(0) 앱 안에서 넘어왔는지를 가린다.
let moves = 0
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => (moves += 1))

// 앞 화면으로 돌아간다. 다른 사이트의 링크로 바로 들어왔으면 앱 밖으로 나가지 않고 홈으로 간다.
export function goBack(): void {
  if (moves > 0) window.history.back()
  else navigate({ name: 'home' })
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseHash(hash)
}
