import { Image, type ImageOptions } from '@tiptap/extension-image'
import type { TacticDragPayload } from '@highpress/core/body'

export const MISSING_MEDIA_TEXT = '이 기기에 없는 미디어'

// 저장된 본문 · 붙여넣은 HTML의 전술 속성은 믿지 않고 모양을 확인한다.
export function safeTacticFormat(value: unknown): TacticDragPayload['format'] | null {
  return value === 'png' || value === 'gif' ? value : null
}

export function safeSceneIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export interface MediaImageOptions extends ImageOptions {
  // 이 세션에서 mediaId에 대응하는 화면용 주소(웹 blob: URL, 앱 웹뷰의 사본 주소). 붙여넣은 이미지의 src를 되살릴 때 쓴다.
  resolveSrc: (mediaId: string) => string | null
}

const dataAttr = (name: string, key: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(name),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [name]: attrs[key] } : {}),
})

// 본문 미디어 규약(@highpress/core/body 의 bodyMedia)에 맞춘 image 노드.
export const MediaImage = Image.extend<MediaImageOptions>({
  addOptions() {
    return { ...this.parent!(), resolveSrc: () => null }
  },

  addAttributes() {
    const { resolveSrc } = this.options
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const mediaId = el.getAttribute('data-media-id')
          return mediaId ? resolveSrc(mediaId) : el.getAttribute('src')
        },
      },
      mediaId: dataAttr('data-media-id', 'mediaId'),
      tacticProjectId: dataAttr('data-tactic-project-id', 'tacticProjectId'),
      // 파일이 사라졌을 때 같은 모양으로 다시 만들기 위한 정보 (웹 tacticRestore.ts)
      tacticFormat: {
        default: null,
        parseHTML: (el: HTMLElement) => safeTacticFormat(el.getAttribute('data-tactic-format')),
        renderHTML: (attrs: Record<string, unknown>) => {
          const format = safeTacticFormat(attrs.tacticFormat)
          return format ? { 'data-tactic-format': format } : {}
        },
      },
      tacticSceneIndex: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-tactic-scene-index')
          return raw === null ? null : safeSceneIndex(Number(raw))
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const index = safeSceneIndex(attrs.tacticSceneIndex)
          return index === null ? {} : { 'data-tactic-scene-index': index }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-media-id]' }, ...(this.parent?.() ?? [])]
  },

  addNodeView() {
    const resizable = this.parent?.()
    if (!resizable) return null
    return (props) => {
      if (props.node.attrs.src) return resizable(props)
      // 파일이 이 기기에 없으면 깨진 이미지 대신 자리표시를 보여 준다.
      const dom = document.createElement('div')
      dom.className = 'media-missing'
      dom.contentEditable = 'false'
      dom.setAttribute('role', 'img')
      dom.setAttribute('aria-label', MISSING_MEDIA_TEXT)
      dom.textContent = MISSING_MEDIA_TEXT
      return { dom, update: (node) => node.type === props.node.type && !node.attrs.src }
    }
  },
})
