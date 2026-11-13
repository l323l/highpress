import type { JSONContent } from './json'

// 모션·영상·스탯 결과물을 본문에 넣는 공통 규약.
// 본문에는 image 노드로 들어가고, 실제 파일은 media 테이블에 둔다. 노드는 attrs.mediaId로 파일을 가리킨다.
// blob: URL은 세션마다 달라지므로 저장할 때 src를 비우고(stripMediaSrc), 열 때 다시 채운다(hydrateMediaSrc).
export const TACTIC_DRAG_MIME = 'application/x-football-tactic'

export type TacticFormat = 'png' | 'gif' | 'mp4'

// 모션 창에서 글쓰기 창으로 끌어다 놓을 때 dataTransfer에 JSON으로 싣는다 (E-6).
export interface TacticDragPayload {
  projectId: string
  format: Exclude<TacticFormat, 'mp4'>
  // png일 때 그릴 장면. 없으면 첫 장면.
  sceneIndex?: number
}

const MAX_DEPTH = 100

// 본문은 믿을 수 없는 곳(백업 파일)에서도 오므로 모양이 틀린 content와 지나친 중첩을 견뎌야 한다.
function mapNodes(node: JSONContent, fn: (node: JSONContent) => JSONContent, depth = 0): JSONContent {
  if (depth > MAX_DEPTH) throw new Error('본문이 너무 깊게 중첩되어 있습니다.')
  const { content, ...mapped } = fn(node)
  if (!Array.isArray(content)) return mapped
  const children = content.filter((child) => typeof child === 'object' && child !== null && !Array.isArray(child))
  return { ...mapped, content: children.map((child) => mapNodes(child, fn, depth + 1)) }
}

const hasMedia = (node: JSONContent) => node.type === 'image' && typeof node.attrs?.mediaId === 'string'

export function stripMediaSrc(doc: JSONContent): JSONContent {
  return mapNodes(doc, (node) => (hasMedia(node) ? { ...node, attrs: { ...node.attrs, src: null } } : node))
}

// 모든 image 노드의 src를 비운다. 믿을 수 없는 본문(백업 파일)을 받을 때 쓴다.
export function dropImageSrc(doc: JSONContent): JSONContent {
  return mapNodes(doc, (node) => (node.type === 'image' ? { ...node, attrs: { ...node.attrs, src: null } } : node))
}

export function collectMediaIds(doc: JSONContent): string[] {
  const ids: string[] = []
  mapNodes(doc, (node) => {
    if (hasMedia(node)) ids.push(node.attrs!.mediaId)
    return node
  })
  return ids
}

// resolve가 null을 주면(파일이 기기에 없음) src를 비워 둔다. 화면에서는 자리표시로 보인다.
export async function hydrateMediaSrc(
  doc: JSONContent,
  resolve: (mediaId: string) => Promise<string | null>,
): Promise<JSONContent> {
  const urls = new Map<string, string | null>()
  for (const id of new Set(collectMediaIds(doc))) urls.set(id, await resolve(id))
  // mediaId가 없는 image는 이 앱이 만든 것이 아니므로 src를 비워 외부 요청이 나가지 않게 한다.
  return mapNodes(doc, (node) =>
    node.type === 'image'
      ? { ...node, attrs: { ...node.attrs, src: hasMedia(node) ? (urls.get(node.attrs!.mediaId) ?? null) : null } }
      : node,
  )
}
