import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLineHeight: {
      setBlockLineHeight: (lineHeight: string) => ReturnType
      unsetBlockLineHeight: () => ReturnType
    }
  }
}

const TYPES = ['heading', 'paragraph']

// 저장된 본문이나 붙여넣은 HTML의 값이 style에 그대로 들어가므로 숫자 꼴만 받는다.
export function safeLineHeight(value: unknown): string | null {
  return typeof value === 'string' && /^\d{1,2}(\.\d{1,2})?$/.test(value) ? value : null
}

// 줄간격은 문단 단위로 건다. 글자(textStyle)에 걸면 .prose의 문단 줄간격보다 작은 값이 보이지 않는다.
export const BlockLineHeight = Extension.create({
  name: 'blockLineHeight',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => safeLineHeight(element.style.lineHeight),
            renderHTML: (attributes) => {
              const lineHeight = safeLineHeight(attributes.lineHeight)
              return lineHeight ? { style: `line-height: ${lineHeight}` } : {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockLineHeight:
        (lineHeight) =>
        ({ commands }) =>
          safeLineHeight(lineHeight) !== null && TYPES.map((type) => commands.updateAttributes(type, { lineHeight })).some(Boolean),
      unsetBlockLineHeight:
        () =>
        ({ commands }) =>
          TYPES.map((type) => commands.resetAttributes(type, 'lineHeight')).some(Boolean),
    }
  },
})
