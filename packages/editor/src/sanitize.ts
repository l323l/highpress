import DOMPurify from 'dompurify'

// 붙여넣기·내보내기 HTML에서 스크립트와 이벤트 핸들러를 제거한다 (SEC-8).
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'picture'],
    // 붙여넣은 내용이 앱의 버튼 모양을 흉내 내거나(class) 창 관계를 바꾸지(rel, target) 못하게 한다.
    FORBID_ATTR: ['class', 'id', 'rel', 'target', 'srcset'],
  })
}
