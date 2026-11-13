import { isId } from '@highpress/core/db'
import { TACTIC_DRAG_MIME, type TacticDragPayload } from '@highpress/core/body'
import { safeSceneIndex, safeTacticFormat } from '@highpress/editor'

export { safeSceneIndex, safeTacticFormat }

export function hasTacticPayload(dataTransfer: DataTransfer | null | undefined): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(TACTIC_DRAG_MIME)
}

// dataTransfer에 실린 문자열은 신뢰하지 않고 모양을 확인한다.
export function parseTacticPayload(raw: string): TacticDragPayload | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { projectId, format, sceneIndex } = value as Record<string, unknown>
  if (!isId(projectId)) return null
  const safeFormat = safeTacticFormat(format)
  if (!safeFormat) return null
  if (sceneIndex === undefined) return { projectId, format: safeFormat }
  const safeIndex = safeSceneIndex(sceneIndex)
  return safeIndex === null ? null : { projectId, format: safeFormat, sceneIndex: safeIndex }
}
