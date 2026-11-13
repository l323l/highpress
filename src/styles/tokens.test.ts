import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import tokens from './tokens.json'

// 웹 CSS(tokens.css)가 tokens.json 과 같은 값인지 본다.
// vitest 는 저장소 맨 위에서 돈다 (jsdom 에서는 import.meta.url 이 파일 주소가 아니다)
const css = readFileSync('src/styles/tokens.css', 'utf8')
type Theme = 'light' | 'dark'
const THEMES: Theme[] = ['light', 'dark']

function cssVars(theme: Theme): Record<string, string> {
  const selector = theme === 'light' ? ':root {' : ":root[data-theme='dark'] {"
  const start = css.indexOf(selector)
  const body = css.slice(start + selector.length, css.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  const vars: Record<string, string> = {}
  for (const line of body.split(';')) {
    const match = /^\s*--([a-z0-9-]+):\s*(.+?)\s*$/s.exec(line)
    if (match) vars[match[1]] = match[2]
  }
  return vars
}

describe('디자인 토큰', () => {
  it('생성한 파일이 tokens.json 과 어긋나지 않는다 (gen-tokens --check)', () => {
    expect(() => execFileSync(process.execPath, ['scripts/gen-tokens.mjs', '--check'], { stdio: 'pipe' })).not.toThrow()
  })

  it.each(THEMES)('%s: 웹 CSS 변수가 tokens.json 과 같은 값이다', (theme) => {
    const vars = cssVars(theme)
    for (const [name, value] of Object.entries(tokens.color[theme] as Record<string, string>)) {
      expect(vars[name], `--${name}`).toBe(value)
    }
    expect(vars.shadow).toBe(tokens.shadow[theme])
  })

  it('모서리 · 간격 · 이징이 같다', () => {
    const vars = cssVars('light')
    for (const [name, value] of Object.entries(tokens.size)) {
      expect(vars[name]).toBe(`${value}px`)
    }
    expect(vars.ease).toBe(`cubic-bezier(${tokens.ease.join(', ')})`)
  })

  it('어두운 화면은 밝은 화면의 색 이름을 모두 다시 정한다', () => {
    expect(Object.keys(cssVars('dark')).sort()).toEqual([...Object.keys(tokens.color.dark), 'shadow'].sort())
  })
})
