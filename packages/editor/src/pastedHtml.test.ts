import { describe, expect, it } from 'vitest'
import { cleanPastedHtml, pastedHtmlHasText } from './pastedHtml'

describe('붙여넣은 HTML 정리', () => {
  it('스크립트와 이벤트 핸들러를 없앤다', () => {
    const html = cleanPastedHtml('<p onclick="x()">글<script>alert(1)</script></p><a href="javascript:alert(1)">링크</a>')
    expect(html).not.toMatch(/script|onclick|javascript:/i)
    expect(html).toContain('글')
  })

  it('외부 이미지는 빼고, 이 에디터의 이미지는 mediaId만 남긴다', () => {
    const html = cleanPastedHtml(
      '<p>a</p><img src="https://evil.example/t.png"><img src="https://evil.example/u.png" data-media-id="m1" onerror="x()">',
    )
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const images = doc.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute('data-media-id')).toBe('m1')
    expect(images[0].hasAttribute('src')).toBe(false)
    expect(images[0].hasAttribute('onerror')).toBe(false)
  })

  it('글이 있는 붙여넣기인지 구분한다', () => {
    expect(pastedHtmlHasText('<table><tr><td>1</td></tr></table>')).toBe(true)
    expect(pastedHtmlHasText('<img src="https://a.com/a.png">')).toBe(false)
    expect(pastedHtmlHasText('')).toBe(false)
    expect(pastedHtmlHasText(undefined)).toBe(false)
  })
})
