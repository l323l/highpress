import type { FeedComment } from './remote'

// 댓글 한 개와 그 아래에 달린 답글들.
export interface CommentNode {
  comment: FeedComment
  replies: CommentNode[]
}

// 한 줄로 온 댓글 목록(먼저 쓴 순)을 답글 관계에 따라 엮는다.
// 글에 바로 단 댓글은 order 에 따라 먼저 쓴 순(old)이나 최근 순(new)으로, 답글은 늘 먼저 쓴 순으로 둔다 (대화가 위에서 아래로 읽히게).
// 윗댓글이 목록에 없는 답글(목록이 200개에서 잘린 경우 등)은 글에 바로 단 댓글처럼 보여 준다.
export function buildThreads(list: FeedComment[], order: 'old' | 'new' = 'old'): CommentNode[] {
  const nodes = new Map<string, CommentNode>(list.map((comment) => [comment.id, { comment, replies: [] }]))
  const roots: CommentNode[] = []
  for (const comment of list) {
    const node = nodes.get(comment.id) as CommentNode
    const parent = comment.parentId && comment.parentId !== comment.id ? nodes.get(comment.parentId) : undefined
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }
  return order === 'new' ? roots.reverse() : roots
}

// 이 댓글 아래에 달린 답글 수 (답글의 답글까지).
export function countReplies(node: CommentNode): number {
  return node.replies.reduce((sum, reply) => sum + 1 + countReplies(reply), 0)
}
