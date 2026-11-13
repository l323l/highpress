// 네이버 카페 글쓰기 API 실측: 네이버 로그인 → 글 한 편(서식 + 표 + 사진 2장)을 시험용 카페에 올려 본다.
// 실행: node experiments/naver-cafe-test.mjs ["방식 이름" ...]
//   한 번 로그인해 여러 방식으로 차례로 올려 본다. 시도 사이에는 90초 쉰다. 방식 이름은 아래 attempts 의 키.
// 필요한 값(.env.local): NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_CAFE_CLUBID, NAVER_CAFE_MENUID
// 받은 토큰은 이 프로그램이 끝나면 사라진다. 어디에도 적지 않는다.
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { crc32, deflateSync } from 'node:zlib'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
)
const need = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_CAFE_CLUBID', 'NAVER_CAFE_MENUID']
const missing = need.filter((key) => !env[key])
if (missing.length > 0) {
  console.log(`.env.local 에 다음 값이 없습니다: ${missing.join(', ')}`)
  process.exit(1)
}

const PORT = 5173
const CALLBACK = `http://localhost:${PORT}/naver-callback`
const state = randomBytes(16).toString('hex')

// 시험용 사진: 한 가지 색으로 채운 PNG 를 직접 만든다 (파일을 따로 두지 않으려고).
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).fill(Buffer.from([r, g, b]))])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

const stamp = new Date().toLocaleString('ko-KR')
const subject = `HIGH PRESS 시험 글 (${stamp})`
const content = [
  '<p>하이프레스에서 <b>직접 올린</b> 시험 글입니다. <span style="color:#e03131">붉은 글자</span>와 <font color="blue">파란 글자</font>, <u>밑줄</u>, <i>기울임</i>.</p>',
  '<p style="text-align:center; font-size:20px; line-height:2">가운데 정렬 · 큰 글자 · 넓은 줄간격</p>',
  "<p>첫째 사진(초록)이 이 문단 바로 아래에 와야 합니다.</p><img src='#0' />",
  '<table border="1" style="border-collapse:collapse"><tr><th>순위</th><th>팀</th><th>승점</th></tr><tr><td>1</td><td>아스널</td><td>24</td></tr><tr><td>2</td><td>리버풀</td><td>22</td></tr></table>',
  "<p>둘째 사진(붉은색)이 표 아래, 이 문단 바로 아래에 와야 합니다.</p><img src='#1' />",
  '<blockquote>인용문입니다.</blockquote><ul><li>목록 하나</li><li>목록 둘</li></ul><p><a href="https://soft-water-9a1a.jawon2517.workers.dev">링크</a></p>',
].join('')

const articlesUrl = `https://openapi.naver.com/v1/cafe/${env.NAVER_CAFE_CLUBID}/menu/${env.NAVER_CAFE_MENUID}/articles`
const body = (withImages) => content.replace(/<p>[^<]*사진[^<]*<\/p><img src='#\d' \/>/g, withImages ? (match) => match : '')

// 옛 한글 방식(MS949)으로 바꾼 뒤 % 인코딩한다. 그 방식에 없는 글자는 본문에서는 &#숫자; 로, 제목에서는 ? 로 바꾼다.
const ms949 = new Map()
{
  const decoder = new TextDecoder('euc-kr')
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      const char = decoder.decode(Uint8Array.of(lead, trail))
      if (char.length === 1 && char !== '�' && !ms949.has(char)) ms949.set(char, [lead, trail])
    }
  }
}
const form = (token, data) => fetch(articlesUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: data })

// 옛 한글 방식(MS949)의 바이트. 그 방식에 없는 글자는 본문에서는 &#숫자; 로, 제목에서는 ? 로 바꾼다.
function bytes949(text, html) {
  const out = []
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code < 0x80) out.push(code)
    else if (ms949.has(char)) out.push(...ms949.get(char))
    else out.push(...(html ? Array.from(`&#${code};`, (c) => c.charCodeAt(0)) : [0x3f]))
  }
  return Buffer.from(out)
}

// 한글을 모두 &#숫자; 로 바꾼다. 서버가 어떻게 읽든 브라우저가 올바른 글자로 보여 준다.
const entities = (text) => Array.from(text, (char) => (char.codePointAt(0) < 0x80 ? char : `&#${char.codePointAt(0)};`)).join('')

// 여러 부분 형식을 직접 짠다 (글자를 원하는 바이트 그대로 넣으려고). partType: 글 부분에 붙일 Content-Type.
function rawMultipart(token, subjectBytes, contentBytes, images, partType, imageField = () => 'image') {
  const boundary = `----hp${randomBytes(12).toString('hex')}`
  const chunks = []
  const field = (name, value) => {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n${partType ? `Content-Type: ${partType}\r\n` : ''}\r\n`), value, Buffer.from('\r\n'))
  }
  field('subject', subjectBytes)
  field('content', contentBytes)
  const colors = [[31, 90, 65], [200, 40, 50]]
  for (let index = 0; index < images; index++) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${imageField(index)}"; filename="photo${index}.png"\r\nContent-Type: image/png\r\n\r\n`), png(640, 360, colors[index]), Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return fetch(articlesUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(chunks) })
}

// 사진 자리 표시 시험: 글마다 사진 2장(초록, 붉은색)을 붙이고 두 자리에 서로 다른 표기를 넣는다.
// 표기가 통하면 그 사진이 글 맨 위가 아니라 그 자리에 나온다. 어떤 표기인지는 본문에 글자로 적어 둔다.
const show = (markup) => markup.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const spots = (note, first, second) =>
  `<p>[${note}]</p><p>자리 1 (초록 사진이 여기 와야 함) 표기: ${show(first)}</p>${first}<p>자리 2 (붉은 사진이 여기 와야 함) 표기: ${show(second)}</p>${second}<p>끝.</p>`
const photoPost = (token, title, note, first, second, imageField) =>
  rawMultipart(token, bytes949(title, false), bytes949(spots(note, first, second), true), 2, '', imageField)

const attempts = [
  ['사진 칸 이름 image[0], image[1] · 공식 표기', 'HP 시험 9', (token, title) => photoPost(token, title, '9 field image[0] image[1]', "<img src='#0' />", "<img src='#1' />", (index) => `image[${index}]`)],
  ['큰따옴표 · 따옴표 없음', 'HP 시험 10', (token, title) => photoPost(token, title, '10 double quote / no quote', '<img src="#0">', '<img src=#1>')],
  ['대문자 · 빈칸 없는 닫기', 'HP 시험 11', (token, title) => photoPost(token, title, '11 uppercase / no space', "<IMG SRC='#0'>", "<img src='#1'/>")],
  ['파일 이름 · 큰따옴표와 닫기', 'HP 시험 12', (token, title) => photoPost(token, title, '12 file name / double quote slash', "<img src='photo0.png' />", '<img src="#1" />')],
]

async function post(token) {
  // 토큰이 살아 있는지부터 본다 (프로필 조회). 여기서 막히면 글쓰기 문제가 아니다.
  const me = await fetch('https://openapi.naver.com/v1/nid/me', { headers: { Authorization: `Bearer ${token}` } })
  console.log(`토큰 확인(프로필 조회): ${me.status}`)
  let last = { status: 0, body: '' }
  for (const [index, [name, title, run]] of attempts.entries()) {
    if (index > 0) {
      // 카페는 글을 연달아 올리지 못하게 막는다. 시도 사이에 넉넉히 쉰다.
      console.log('연속 등록 제한을 피하려고 100초 기다립니다…')
      await new Promise((resolve) => setTimeout(resolve, 100_000))
    }
    const response = await run(token, title)
    last = { status: response.status, body: (await response.text()).replace(/\s+/g, ' ') }
    console.log(`[${name}] 제목 "${title}" · 상태 ${last.status} · ${last.body.slice(0, 300)}`)
  }
  return last
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/naver-callback') {
    response.writeHead(404).end()
    return
  }
  const say = (text) => response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${text}\n\n이 창은 닫아도 됩니다. 결과는 터미널에 있습니다.`)
  try {
    if (url.searchParams.get('error')) throw new Error(`로그인 거절: ${url.searchParams.get('error')} ${url.searchParams.get('error_description') ?? ''}`)
    if (url.searchParams.get('state') !== state) throw new Error('state 값이 맞지 않습니다 (다른 곳에서 온 요청).')
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token')
    tokenUrl.search = new URLSearchParams({ grant_type: 'authorization_code', client_id: env.NAVER_CLIENT_ID, client_secret: env.NAVER_CLIENT_SECRET, code: url.searchParams.get('code') ?? '', state }).toString()
    const token = await (await fetch(tokenUrl)).json()
    if (!token.access_token) throw new Error(`토큰을 받지 못했습니다: ${token.error ?? ''} ${token.error_description ?? ''}`)
    console.log('로그인 완료. 여러 방식으로 차례로 올려 봅니다.')
    const result = await post(token.access_token)
    say(result.status === 200 ? '글을 올렸습니다. 카페에서 확인해 주세요.' : `글을 올리지 못했습니다 (상태 ${result.status}).`)
  } catch (error) {
    console.log(`실패: ${error.message}`)
    say(`실패: ${error.message}`)
  }
  server.close()
})

server.on('error', (error) => {
  console.log(error.code === 'EADDRINUSE' ? `${PORT} 포트가 쓰이고 있습니다. 개발 서버(npm run dev)를 끈 뒤 다시 실행해 주세요.` : error.message)
  process.exit(1)
})
server.listen(PORT, () => {
  const authorize = new URL('https://nid.naver.com/oauth2.0/authorize')
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: env.NAVER_CLIENT_ID, redirect_uri: CALLBACK, state, auth_type: 'reprompt' }).toString()
  console.log('브라우저에서 네이버 로그인 창을 엽니다. 동의 화면에서 "카페 글쓰기"를 꼭 선택해 주세요.')
  console.log(`창이 열리지 않으면 이 주소를 직접 열어 주세요:\n${authorize}`)
  execFile('rundll32', ['url.dll,FileProtocolHandler', authorize.toString()], () => {})
})
