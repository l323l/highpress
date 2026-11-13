import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { statsProxy } from './vite/statsProxy.ts'

// Tiptap이 글자색·정렬을 style 속성으로 쓰므로 style-src에 'unsafe-inline'이 필요하다.
// 스크립트는 같은 출처 파일만 허용한다. worker-src blob:은 mediabunny(MP4)가 쓴다.
// connect는 서버(Supabase)를 쓸 때만 그 주소 하나를 더 허용한다. 주소는 빌드할 때 .env.local에서 읽는다.
// 그림은 같은 출처와 기기 안의 것(blob:)만 받되, 프로필 사진은 서버의 공개 보관함(avatars)에서 주소로 바로 읽으므로 그 경로 하나만 더 허용한다.
// 대표 사진은 받아 와서 blob: 으로 보여 주므로 여기에 넣지 않는다.
const cspDirectives = (serverOrigin: string) => [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  serverOrigin ? `img-src 'self' blob: ${serverOrigin}/storage/v1/object/public/avatars/` : "img-src 'self' blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  serverOrigin ? `connect-src 'self' ${serverOrigin}` : "connect-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
]

// frame-ancestors와 upgrade-insecure-requests는 응답 헤더에서만 의미가 있거나(전자),
// http://localhost 미리보기를 깨뜨릴 수 있어(후자) 헤더 파일에만 넣는다.
const headersFile = (serverOrigin: string) => [
  '/*',
  `  Content-Security-Policy: ${[...cspDirectives(serverOrigin), "frame-ancestors 'none'", 'upgrade-insecure-requests'].join('; ')}`,
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
  '',
].join('\n')

// 개발 서버는 인라인 스크립트(HMR)를 쓰므로 CSP는 빌드 결과물에만 넣는다.
// 메타 태그는 어느 정적 호스팅에서나 적용되고, _headers는 Cloudflare Pages·Netlify가 읽는다.
function csp(serverOrigin: string): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: cspDirectives(serverOrigin).join('; ') },
        injectTo: 'head-prepend',
      },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(serverOrigin) })
    },
  }
}

// 주소가 올바른 꼴일 때만 출처(https://xxxx.supabase.co)를 돌려준다. CSP에 엉뚱한 글자가 섞이지 않게 한다.
function serverOrigin(url: string | undefined): string {
  try {
    const parsed = new URL((url ?? '').trim())
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' ? parsed.origin : ''
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 접두사 없이 읽은 값은 이 설정 파일 안에서만 쓴다. VITE_로 시작하지 않으므로 번들에는 들어가지 않는다.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), csp(serverOrigin(env.VITE_SUPABASE_URL)), statsProxy({ footballData: env.FOOTBALL_DATA_TOKEN, apiFootball: env.API_FOOTBALL_KEY })],
    test: {
      projects: [
        { test: { name: 'web', environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] } },
        // packages/core 는 브라우저 없이 돈다. DOM 에 기대면 여기서 드러난다.
        { test: { name: 'core', environment: 'node', include: ['packages/core/src/**/*.test.ts'] } },
        // packages/editor 는 DOM(웹 화면 · 앱 웹뷰)에서 돈다.
        { test: { name: 'editor', environment: 'jsdom', include: ['packages/editor/src/**/*.test.ts'] } },
      ],
    },
  }
})
