const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:']
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function parse(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

// 링크 입력값을 저장할 href로 바꾼다. http/https/mailto만 허용하고, 나머지는 null.
// 'example.com'처럼 스킴이 없으면 https://를 붙인다.
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim()
  if (!value || /\s/.test(value)) return null
  if (SCHEME.test(value)) {
    const url = parse(value)
    if (!url || !LINK_PROTOCOLS.includes(url.protocol)) return null
    if (url.protocol === 'mailto:') return url.pathname.includes('@') ? value : null
    return url.hostname ? value : null
  }
  const url = parse(`https://${value}`)
  return url && url.hostname.includes('.') ? `https://${value}` : null
}

// Tiptap Link의 isAllowedUri에서 쓴다. 스킴이 없는 값은 Tiptap 기본 검사에 맡긴다.
export function hasAllowedScheme(uri: string): boolean {
  const scheme = SCHEME.exec(uri.trim())
  return !scheme || LINK_PROTOCOLS.includes(scheme[0].toLowerCase())
}

// 화면에 링크로 내보내도 되는 주소인지: http/https이고 계정 정보(user@host)가 없어야 한다.
export function isHttpUrl(input: string): boolean {
  const value = input.trim()
  if (!value || /\s/.test(value)) return false
  try {
    const url = new URL(value)
    const web = url.protocol === 'http:' || url.protocol === 'https:'
    // https://naver.com@evil.example/ 처럼 주소를 속이는 꼴은 받지 않는다.
    return web && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}
