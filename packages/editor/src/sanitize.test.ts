import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('script 태그를 제거한다', () => {
    const out = sanitizeHtml('<p>안녕</p><script>alert(1)</script>')
    expect(out).toBe('<p>안녕</p>')
  })

  it('onerror 같은 이벤트 핸들러를 제거한다', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).toContain('<img')
  })

  it('javascript: 링크를 제거한다', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">클릭</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('클릭')
  })

  it('iframe과 form 요소를 제거하고 일반 서식은 유지한다', () => {
    const out = sanitizeHtml('<iframe src="https://x"></iframe><form><input></form><strong>굵게</strong>')
    expect(out).not.toMatch(/iframe|form|input/)
    expect(out).toContain('<strong>굵게</strong>')
  })
})
