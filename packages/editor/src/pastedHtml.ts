import { sanitizeHtml } from './sanitize'

function parseSanitized(html: string): Document {
  return new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
}

// 붙여넣은 HTML을 정리한다 (SEC-8). 외부 이미지는 기기에 저장할 수 없고 외부 요청이 생기므로 뺀다.
// 이 에디터에서 복사한 이미지는 data-media-id만 남기고, src는 MediaImage가 다시 채운다.
export function cleanPastedHtml(html: string): string {
  const doc = parseSanitized(html)
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (img.hasAttribute('data-media-id')) img.removeAttribute('src')
    else img.remove()
  }
  // 붙여넣은 링크가 앱 버튼을 흉내 내거나 창 관계를 바꾸지 못하게 한다. 기본값(target, rel)은 Link가 채운다.
  for (const a of Array.from(doc.querySelectorAll('a'))) for (const name of ['class', 'rel', 'target']) a.removeAttribute(name)
  return doc.body.innerHTML
}

// 표·문서를 복사하면 글과 함께 미리보기 이미지 파일이 딸려 온다. 글이 있으면 파일은 넣지 않는다.
export function pastedHtmlHasText(html: string | undefined): boolean {
  if (!html) return false
  return (parseSanitized(html).body.textContent ?? '').trim().length > 0
}
