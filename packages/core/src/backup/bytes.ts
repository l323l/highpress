// 백업 파일의 바이트를 다루는 작은 도구. DOM · React Native 어느 쪽 전역에도 기대지 않는다 (atob · Blob 없이).

let table: Uint32Array | undefined

function crcTable(): Uint32Array {
  if (table) return table
  table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

// ZIP과 같은 CRC-32. 백업 안의 사진이 깨졌는지 확인하는 데 쓴다 (부호 없는 32비트 정수).
export function crc32(data: Uint8Array): number {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = (() => {
  const map = new Int16Array(128).fill(-1)
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET.charCodeAt(i)] = i
  return map
})()

// base64 → 바이트. 꼴이 틀리면 null. 끝의 '='는 없어도 된다 (atob 과 같이 너그럽게).
export function decodeBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null
  const body = text.replace(/=+$/, '')
  if (body.length % 4 === 1) return null
  // '='를 붙였다면 4글자 단위가 맞아야 한다.
  if (body.length !== text.length && text.length % 4 !== 0) return null
  const out = new Uint8Array(Math.floor((body.length * 3) / 4))
  let o = 0
  for (let i = 0; i < body.length; i += 4) {
    const a = LOOKUP[body.charCodeAt(i)]
    const b = LOOKUP[body.charCodeAt(i + 1)]
    const c = i + 2 < body.length ? LOOKUP[body.charCodeAt(i + 2)] : 0
    const d = i + 3 < body.length ? LOOKUP[body.charCodeAt(i + 3)] : 0
    const n = (a << 18) | (b << 12) | (c << 6) | d
    out[o++] = (n >> 16) & 0xff
    if (i + 2 < body.length) out[o++] = (n >> 8) & 0xff
    if (i + 3 < body.length) out[o++] = n & 0xff
  }
  return out
}

// 글자를 UTF-8로 바꿨을 때의 바이트 수 (new Blob([text]).size 와 같은 값). 짝이 없는 대리 문자는 U+FFFD(3바이트)로 센다.
export function utf8Length(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4
      i++
    } else n += 3
  }
  return n
}
