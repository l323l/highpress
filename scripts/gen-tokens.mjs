// src/styles/tokens.json 하나에서 웹 CSS(src/styles/tokens.css)와 앱 TS(mobile/src/theme/tokens.ts)를 만든다.
// 두 결과의 값이 어긋나지 않게 하려는 것이다 (APP-PRD 6.2, APP-PLAN A3-2).
// 실행: node scripts/gen-tokens.mjs        두 파일을 다시 쓴다
//       node scripts/gen-tokens.mjs --check 다시 만들 필요가 있으면 실패한다 (테스트가 쓴다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const paths = {
  json: join(root, 'src/styles/tokens.json'),
  css: join(root, 'src/styles/tokens.css'),
  ts: join(root, 'mobile/src/theme/tokens.ts'),
}

const THEMES = ['light', 'dark']

// 'surface-2' → 'surface2', 'border-strong' → 'borderStrong'
export const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

// CSS 색 → [r, g, b, a]. 토큰에 쓰는 두 꼴(#rrggbb, rgb(r g b / a%))만 받는다. 다른 꼴이 오면 멈춘다.
export function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(value)
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[5] ? Number(rgb[4]) / 100 : Number(rgb[4])
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(alpha.toFixed(4))]
  }
  throw new Error(`토큰 색을 읽지 못했습니다: ${value}`)
}

// React Native 가 확실히 읽는 꼴로 바꾼다. 불투명은 #rrggbb 그대로, 반투명은 rgba(r, g, b, a).
export function nativeColor(value) {
  if (value.startsWith('#')) return value.toLowerCase()
  const [r, g, b, a] = parseColor(value)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// 그림자 안의 색만 바꾸고 0 은 0px 로 적는다 (RN boxShadow).
export function nativeShadow(value) {
  return value
    .replace(/rgba?\([^)]*\)/g, (color) => nativeColor(color))
    .replace(/(^|[\s,])0(?=\s)/g, '$10px')
}

export function readTokens() {
  const tokens = JSON.parse(readFileSync(paths.json, 'utf8'))
  const [first, ...rest] = THEMES.map((theme) => Object.keys(tokens.color[theme]).join(','))
  if (rest.some((keys) => keys !== first)) throw new Error('tokens.json 의 light 와 dark 색 이름이 같아야 합니다.')
  for (const theme of THEMES) for (const value of Object.values(tokens.color[theme])) parseColor(value)
  return tokens
}

const comment = (note, indent = '') => (Array.isArray(note) ? note : [note]).map((line) => `${indent}/* ${line} */\n`).join('')

export function buildCss(tokens) {
  const block = (theme) => {
    let body = ''
    for (const [name, value] of Object.entries(tokens.color[theme])) {
      if (theme === 'light' && tokens.notes[name]) body += comment(tokens.notes[name], '  ')
      body += `  --${name}: ${value};\n`
    }
    body += `  --shadow: ${tokens.shadow[theme]};\n`
    if (theme === 'light') {
      for (const [name, value] of Object.entries(tokens.size)) body += `  --${name}: ${value}px;\n`
      body += `  --ease: cubic-bezier(${tokens.ease.join(', ')});\n`
      body += `  --font: ${tokens.font};\n`
    }
    body += `  color-scheme: ${theme};\n`
    const selector = theme === 'light' ? ':root' : ":root[data-theme='dark']"
    return `${comment(tokens.notes[theme])}${selector} {\n${body}}\n`
  }
  return [
    '/* 이 파일은 scripts/gen-tokens.mjs 가 src/styles/tokens.json 에서 만든다. 직접 고치지 말고 tokens.json 을 고친 뒤 다시 만든다. */\n',
    block('light'),
    block('dark'),
  ].join('\n')
}

export function buildTs(tokens) {
  const palette = (theme) =>
    Object.entries(tokens.color[theme])
      .map(([name, value]) => `    ${camel(name)}: '${nativeColor(value)}',`)
      .join('\n')
  const sizes = Object.entries(tokens.size)
    .map(([name, value]) => `  ${camel(name)}: ${value},`)
    .join('\n')
  return `// 이 파일은 scripts/gen-tokens.mjs 가 src/styles/tokens.json 에서 만든다. 직접 고치지 말고 tokens.json 을 고친 뒤 다시 만든다.
// 이름은 웹 CSS 변수(--surface-2)를 camelCase(surface2)로 바꾼 것이다. 반투명 색은 RN 이 읽는 rgba() 로 적는다.

export const colors = {
  light: {
${palette('light')}
  },
  dark: {
${palette('dark')}
  },
} as const;

export type ColorName = keyof typeof colors.light;
export type Palette = { readonly [K in ColorName]: string };

// RN boxShadow 문자열 (웹 --shadow)
export const shadow = {
  light: '${nativeShadow(tokens.shadow.light)}',
  dark: '${nativeShadow(tokens.shadow.dark)}',
} as const;

// 모서리 · 간격 (웹 --radius, --radius-sm, --pill, --gap. 단위는 pt/dp)
export const size = {
${sizes}
} as const;

// 웹 --ease. Reanimated 에서는 Easing.bezier(...ease) 로 쓴다.
export const ease = [${tokens.ease.join(', ')}] as const;
`
}

function main() {
  const tokens = readTokens()
  const outputs = [
    [paths.css, buildCss(tokens)],
    // 앱(mobile/)이 없는 웹 전용 저장소에서는 웹 CSS만 만든다
    ...(existsSync(join(root, 'mobile')) ? [[paths.ts, buildTs(tokens)]] : []),
  ]
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([path, text]) => {
      try {
        return readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text
      } catch {
        return true
      }
    })
    if (stale.length) {
      console.error(`다시 만들어야 합니다 (node scripts/gen-tokens.mjs):\n${stale.map(([path]) => `  ${path}`).join('\n')}`)
      process.exit(1)
    }
    return
  }
  for (const [path, text] of outputs) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  console.log(`만들었습니다: ${outputs.map(([path]) => path).join(', ')}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
