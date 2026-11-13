import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { StatChart } from './StatChart'
import { parseSnapshot } from '@highpress/core/stats'

export const BROKEN_STAT_TEXT = '읽을 수 없는 스탯 도표'

// 본문 안의 스탯 도표. 저장된 값은 형식을 다시 확인한 뒤에만 그린다.
export function StatBlockView({ node, selected }: NodeViewProps) {
  const snapshot = parseSnapshot(node.attrs.snapshot)
  return (
    <NodeViewWrapper className={selected ? 'stat-block stat-block--selected' : 'stat-block'} contentEditable={false} data-drag-handle>
      {snapshot ? <StatChart snapshot={snapshot} /> : <p className="stat-broken">{BROKEN_STAT_TEXT}</p>}
    </NodeViewWrapper>
  )
}
