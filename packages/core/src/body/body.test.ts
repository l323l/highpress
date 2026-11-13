import { describe, expect, it } from 'vitest'
import { statusOnAutosave, statusOnSave, storedPublishedUrl } from './saveStatus'
import { toColorInputValue } from './toolbarOptions'
import { hasAllowedScheme, isHttpUrl, normalizeLinkUrl } from './urls'

// 웹 src/features/editor/logic.test.ts 에서 core 로 옮긴 부분.

describe('주소 검사', () => {
  it('게시 링크는 http/https만 받는다', () => {
    expect(isHttpUrl('https://cafe.naver.com/abc/123')).toBe(true)
    expect(isHttpUrl(' http://example.com ')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('mailto:a@b.com')).toBe(false)
    expect(isHttpUrl('cafe.naver.com')).toBe(false)
    expect(isHttpUrl('https://exa mple.com')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })

  it('게시 링크에 계정 정보가 들어간 주소는 받지 않는다', () => {
    expect(isHttpUrl('https://cafe.naver.com@evil.example/')).toBe(false)
    expect(isHttpUrl('https://user:pw@example.com/')).toBe(false)
    expect(isHttpUrl('https://example.com/@user')).toBe(true)
  })

  it('본문 링크는 http/https/mailto만 받고 스킴이 없으면 https를 붙인다', () => {
    expect(normalizeLinkUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeLinkUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(normalizeLinkUrl(' example.com/path ')).toBe('https://example.com/path')
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('data:text/html,<script>1</script>')).toBeNull()
    expect(normalizeLinkUrl('vbscript:x')).toBeNull()
    expect(normalizeLinkUrl('mailto:nobody')).toBeNull()
    expect(normalizeLinkUrl('그냥 글자')).toBeNull()
    expect(normalizeLinkUrl('hello')).toBeNull()
    expect(normalizeLinkUrl('')).toBeNull()
  })

  it('허용하지 않는 스킴을 걸러 낸다', () => {
    expect(hasAllowedScheme('https://a.com')).toBe(true)
    expect(hasAllowedScheme('MAILTO:a@b.com')).toBe(true)
    expect(hasAllowedScheme('example.com')).toBe(true)
    expect(hasAllowedScheme('javascript:alert(1)')).toBe(false)
    expect(hasAllowedScheme('tel:010')).toBe(false)
    expect(hasAllowedScheme('ftp://a.com')).toBe(false)
  })
})

describe('저장 상태 전환', () => {
  it('저장 버튼: 게시 링크가 있으면 게시됨, 없으면 저장됨', () => {
    expect(statusOnSave('')).toBe('saved')
    expect(statusOnSave('javascript:alert(1)')).toBe('saved')
    expect(statusOnSave('https://cafe.naver.com/a/1')).toBe('published')
  })

  it('자동 저장: 임시 글은 임시로 남는다', () => {
    expect(statusOnAutosave('draft', '')).toBe('draft')
    expect(statusOnAutosave('draft', 'https://cafe.naver.com/a/1')).toBe('draft')
  })

  it('자동 저장: 저장한 글은 게시 링크를 따라간다', () => {
    expect(statusOnAutosave('saved', 'https://cafe.naver.com/a/1')).toBe('published')
    expect(statusOnAutosave('published', '')).toBe('saved')
    expect(statusOnAutosave('published', 'https://cafe.naver.com/a/1')).toBe('published')
  })

  it('올바르지 않은 게시 링크는 기록하지 않는다', () => {
    expect(storedPublishedUrl(' https://a.com/1 ')).toBe('https://a.com/1')
    expect(storedPublishedUrl('javascript:alert(1)')).toBe('')
    expect(storedPublishedUrl('abc')).toBe('')
  })
})

describe('색 입력값', () => {
  it('#rrggbb가 아니면 기본값을 쓴다', () => {
    expect(toColorInputValue('#FFAA00', '#000000')).toBe('#FFAA00')
    expect(toColorInputValue('rgb(1, 2, 3)', '#000000')).toBe('#000000')
    expect(toColorInputValue(undefined, '#000000')).toBe('#000000')
  })
})
