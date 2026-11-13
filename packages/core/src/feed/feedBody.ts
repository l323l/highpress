import type { JSONContent } from '../body/json'

const MAX_DEPTH = 100
// style 속성으로 나가는 값(글자색·글꼴·줄간격 등)에 다른 선언을 끼워 넣지 못하게 한다.
const UNSAFE_VALUE = /[;{}<>]|url\s*\(|expression\s*\(/i

function cleanAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!attrs || typeof attrs !== 'object') return undefined
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    // 링크 주소는 에디터의 링크 확장이 따로 검사한다 (http, https, mailto 만 허용).
    cleaned[key] = key !== 'href' && typeof value === 'string' && UNSAFE_VALUE.test(value) ? null : value
  }
  return cleaned
}

// 피드에 올리거나 피드에서 받은 본문을 다듬는다: 사진·모션그래픽 자리는 빼고, 위험한 서식 값은 지운다.
// 남의 글을 화면에 그리기 전에도 같은 함수를 거친다 (서버는 본문 모양을 검사하지 않는다).
export function feedBody(node: JSONContent, depth = 0): JSONContent {
  if (depth > MAX_DEPTH) throw new Error('본문이 너무 깊게 중첩되어 있습니다.')
  const { content, marks, attrs, ...rest } = node
  const cleaned: JSONContent = { ...rest }
  const safeAttrs = cleanAttrs(attrs)
  if (safeAttrs) cleaned.attrs = safeAttrs
  if (Array.isArray(marks)) {
    cleaned.marks = marks
      .filter((mark) => typeof mark === 'object' && mark !== null && typeof mark.type === 'string')
      .map((mark) => ({ ...mark, attrs: cleanAttrs(mark.attrs) }))
  }
  if (Array.isArray(content)) {
    cleaned.content = content
      .filter((child) => typeof child === 'object' && child !== null && !Array.isArray(child) && child.type !== 'image')
      .map((child) => feedBody(child, depth + 1))
  }
  return cleaned
}

function collectText(node: JSONContent, out: string[], depth = 0): void {
  if (depth > MAX_DEPTH) return
  if (typeof node.text === 'string') out.push(node.text)
  if (!Array.isArray(node.content)) return
  for (const child of node.content) {
    if (typeof child !== 'object' || child === null) continue
    collectText(child, out, depth + 1)
    // 문단 사이는 띄어 쓴다.
    if (child.type === 'paragraph' || child.type === 'heading') out.push(' ')
  }
}

// 피드 카드에 보일 앞부분.
export function excerptOf(doc: JSONContent, max = 180): string {
  const parts: string[] = []
  collectText(doc, parts)
  const plain = parts.join('').replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}
