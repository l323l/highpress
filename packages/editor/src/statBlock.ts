import { mergeAttributes, Node } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { parseSnapshot, sourceLine, tableOf, type StatSnapshot } from '@highpress/core/stats'

export const STAT_BLOCK = 'statBlock'
const ATTR = 'data-stat-block'

function fromAttribute(raw: string | null): StatSnapshot | null {
  if (!raw) return null
  try {
    return parseSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

// 화면에서는 애니메이션 도표로 보이지만, HTML로는 평범한 표다.
// 그래서 복사하거나 네이버로 내보내도 제목·표·출처가 그대로 넘어간다.
function tableSpec(snapshot: StatSnapshot): DOMOutputSpec[] {
  const { head, body } = tableOf(snapshot)
  return [
    ['p', {}, ['strong', {}, snapshot.title], ...(snapshot.subtitle ? [` ${snapshot.subtitle}`] : [])],
    ['table', {}, ['tbody', {}, ['tr', {}, ...head.map((cell) => ['th', {}, cell])], ...body.map((row) => ['tr', {}, ...row.map((cell) => ['td', {}, String(cell)])])]],
    ['p', {}, sourceLine(snapshot)],
  ] as DOMOutputSpec[]
}

// 조회 시점의 스탯을 담은 본문 블록 (S-5). 안쪽은 편집하지 않고 통째로 옮기거나 지운다.
// 여기에는 스키마만 둔다. 도표 노드 뷰는 화면마다 다르므로 쓰는 쪽이 extend 로 붙인다(웹 features/stats/statBlock.ts).
// 노드 뷰가 없으면 renderHTML의 평범한 표로 보인다.
export const StatBlock = Node.create({
  name: STAT_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      snapshot: {
        default: null,
        parseHTML: (el: HTMLElement) => fromAttribute(el.getAttribute(ATTR)),
        renderHTML: (attrs: Record<string, unknown>) => {
          const snapshot = parseSnapshot(attrs.snapshot)
          return snapshot ? { [ATTR]: JSON.stringify(snapshot) } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: `div[${ATTR}]` }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const snapshot = parseSnapshot(node.attrs.snapshot)
    return ['div', mergeAttributes(HTMLAttributes), ...(snapshot ? tableSpec(snapshot) : [])]
  },
})
