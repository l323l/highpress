import { sanitizeHtml } from '@highpress/editor/sanitize'

export interface ExportFile {
  number: number
  name: string
  mediaId: string
}

export interface ExportDocument {
  html: string
  text: string
  files: ExportFile[]
  // 파일을 찾을 수 없어 번호를 매기지 못한 이미지 수
  missing: number
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// 네이버 에디터는 클래스 기반 스타일을 버리므로 표 모양은 인라인 스타일로 싣는다.
const TABLE_STYLE = 'border-collapse: collapse;'
const CELL_STYLE = 'border: 1px solid #999999; padding: 4px 8px;'
const HEADER_STYLE = 'background-color: #f1f3f5;'
const PLACEHOLDER_COLOR = '#868e96'
const TEXT_BLOCKS = 'p, h1, h2, h3, h4, h5, h6'

export const MISSING_LABEL = '[이미지 — 이 기기에 파일이 없어 내보내지 못했습니다]'

export function placeholderLabel(file: ExportFile): string {
  return `[이미지 ${file.number} — ${file.name} 를 여기에 첨부]`
}

function addStyle(el: Element, style: string): void {
  const current = el.getAttribute('style')?.trim() ?? ''
  el.setAttribute('style', current ? `${current.replace(/;?$/, ';')} ${style}` : style)
}

// 에디터 HTML을 네이버 에디터에 붙여넣을 형태로 바꾼다 (N-7).
// 이미지·GIF는 붙여넣기로 넘어가지 않으므로 번호 자리표시만 남기고, 같은 번호의 파일명을 돌려준다.
// labelOf: 사진 자리에 남길 글자. 네이버 카페 직접 게시는 다른 안내를 쓴다.
export function buildExportDocument(
  editorHtml: string,
  mimeOf: (mediaId: string) => string | undefined,
  labelOf: (file: ExportFile) => string = placeholderLabel,
): ExportDocument {
  const doc = new DOMParser().parseFromString(sanitizeHtml(editorHtml), 'text/html')
  const files = new Map<string, ExportFile>()
  let missing = 0

  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const mediaId = img.getAttribute('data-media-id')
    const extension = mediaId ? EXTENSIONS[mimeOf(mediaId) ?? ''] : undefined
    let label = MISSING_LABEL
    if (mediaId && extension) {
      // 같은 그림을 여러 번 넣었으면 파일 하나를 같은 번호로 가리킨다.
      let file = files.get(mediaId)
      if (!file) {
        const number = files.size + 1
        file = { number, name: `${String(number).padStart(2, '0')}.${extension}`, mediaId }
        files.set(mediaId, file)
      }
      label = labelOf(file)
    } else {
      missing += 1
    }
    const span = doc.createElement('span')
    span.setAttribute('style', `color: ${PLACEHOLDER_COLOR};`)
    span.textContent = label
    if (img.closest(TEXT_BLOCKS)) {
      img.replaceWith(span)
    } else {
      const block = doc.createElement('p')
      block.setAttribute('style', 'text-align: center;')
      block.append(span)
      img.replaceWith(block)
    }
  }

  for (const table of Array.from(doc.querySelectorAll('table'))) addStyle(table, TABLE_STYLE)
  for (const cell of Array.from(doc.querySelectorAll('th, td'))) {
    // 사용자가 칸 색을 정했으면 머리글 기본색으로 덮지 않는다.
    const plainHeader = cell.tagName === 'TH' && !/background/i.test(cell.getAttribute('style') ?? '')
    addStyle(cell, plainHeader ? `${CELL_STYLE} ${HEADER_STYLE}` : CELL_STYLE)
  }

  // 앱 내부용 data-* 속성은 내보내지 않는다.
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) el.removeAttribute(attr.name)
    }
  }

  const html = doc.body.innerHTML
  // 일반 텍스트에서는 줄바꿈(<br>)이 사라지지 않게 글자로 바꾼다. html은 위에서 이미 뽑았다.
  for (const br of Array.from(doc.querySelectorAll('br'))) br.replaceWith('\n')
  const text = Array.from(doc.body.querySelectorAll(TEXT_BLOCKS))
    .map((block) => block.textContent ?? '')
    .join('\n')
  return { html, text, files: [...files.values()], missing }
}
