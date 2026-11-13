// 네이버 카페 글쓰기 요청을 만든다. 2026-10-12 실측(m0/naver-cafe-test.mjs, PLAN.md 결정 기록)으로 확인한 방식이다.
// - multipart/form-data 로 subject, content, image(되풀이)를 보낸다.
// - 제목과 본문은 옛 한글 방식(MS949) 바이트 그대로 넣는다. UTF-8 로 보내면 한글이 깨지고, % 인코딩하면 오류 999 로 거절된다.
// - MS949 에 없는 글자는 &#숫자; 로 바꾼다 (제목에서도 올바른 글자로 보인다).
// - 사진은 본문 중간에 넣을 수 없고 글 맨 위에 순서대로 붙는다.
// 서버 함수(Deno)와 테스트(Node)가 함께 쓰므로 어느 한쪽에만 있는 기능은 쓰지 않는다.

let table: Map<string, [number, number]> | null = null

function ms949Table(): Map<string, [number, number]> {
  if (table) return table
  table = new Map()
  const decoder = new TextDecoder('euc-kr')
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      const char = decoder.decode(Uint8Array.of(lead, trail))
      if (char.length === 1 && char !== '�' && !table.has(char)) table.set(char, [lead, trail])
    }
  }
  return table
}

export function ms949Bytes(text: string): Uint8Array {
  const map = ms949Table()
  const out: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    const pair = code < 0x80 ? null : map.get(char)
    if (code < 0x80) out.push(code)
    else if (pair) out.push(pair[0], pair[1])
    else for (const digit of `&#${code};`) out.push(digit.charCodeAt(0))
  }
  return Uint8Array.from(out)
}

export interface CafeImage {
  // image/jpeg, image/png, image/gif 가운데 하나
  type: string
  bytes: Uint8Array
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }

export function isCafeImageType(type: string): boolean {
  return type in EXTENSIONS
}

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

function join(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

// boundary 는 영문·숫자만 쓴다. 파일 이름도 영문·숫자로 다시 짓는다 (사용자가 지은 이름을 머리글에 넣지 않는다).
export function cafeMultipart(subject: string, content: string, images: CafeImage[], boundary: string): Uint8Array {
  if (!/^[A-Za-z0-9-]{8,60}$/.test(boundary)) throw new Error('boundary')
  const chunks: Uint8Array[] = []
  const field = (name: string, value: Uint8Array) => {
    chunks.push(ascii(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`), value, ascii('\r\n'))
  }
  field('subject', ms949Bytes(subject))
  field('content', ms949Bytes(content))
  images.forEach((image, index) => {
    const extension = EXTENSIONS[image.type]
    if (!extension) throw new Error('image type')
    chunks.push(ascii(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="photo${index + 1}.${extension}"\r\nContent-Type: ${image.type}\r\n\r\n`), image.bytes, ascii('\r\n'))
  })
  chunks.push(ascii(`--${boundary}--\r\n`))
  return join(chunks)
}

// too-fast: 글을 연달아 올렸다, login: 네이버 로그인이 끝났거나 카페 글쓰기에 동의하지 않았다, failed: 그 밖의 거절
export type CafeResult = { ok: true; url: string } | { ok: false; reason: 'too-fast' | 'login' | 'failed'; detail: string }

// 네이버의 응답을 읽는다. 성공하면 올라간 글의 주소가 온다.
export function readCafeResult(status: number, text: string): CafeResult {
  let message: { result?: { articleUrl?: unknown }; error?: { code?: unknown; msg?: unknown; message?: unknown } } = {}
  try {
    message = (JSON.parse(text) as { message?: typeof message }).message ?? {}
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만 본다.
  }
  const url = message.result?.articleUrl
  if (status === 200 && typeof url === 'string' && /^https:\/\/cafe\.naver\.com\//.test(url)) return { ok: true, url }
  const detail = String(message.error?.message ?? message.error?.msg ?? '').slice(0, 200)
  if (/연속/.test(detail)) return { ok: false, reason: 'too-fast', detail }
  if (status === 401) return { ok: false, reason: 'login', detail }
  return { ok: false, reason: 'failed', detail }
}
