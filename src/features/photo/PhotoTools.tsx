import type { Ref } from 'react'
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, TrashIcon } from '../../components/icons'
import { MARK_LIMITS, SWATCHES, type Mark, type StrokeSize, type ToolId } from '@highpress/core/photo'
import { TOOL_GROUPS, TOOLS } from './tools'

const SIZE_LABEL: Record<StrokeSize, string> = { 1: '가늘게', 2: '보통', 3: '굵게' }
const COLOR_NAME: Record<string, string> = { '#ffe14d': '노랑', '#ffffff': '흰색', '#ff4d5e': '빨강', '#38bdf8': '하늘', '#3ddc84': '초록', '#111113': '검정' }

interface Props {
  tool: ToolId
  onTool: (tool: ToolId) => void
  color: string
  onColor: (color: string) => void
  size: StrokeSize
  onSize: (size: StrokeSize) => void
  selected: Mark | null
  onPatch: (patch: Partial<Mark>) => void
  onDelete: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  hasMarks: boolean
  textRef: Ref<HTMLInputElement>
}

export function PhotoTools({ textRef, ...props }: Props) {
  const { tool, selected } = props
  const info = TOOLS.find((item) => item.id === tool) ?? TOOLS[0]
  // 고른 표시가 있으면 색 · 굵기가 그 표시에 바로 들어간다. 없으면 다음에 그릴 표시의 값이다.
  const color = selected ? selected.color : props.color
  const size = selected && 'size' in selected ? selected.size : props.size
  const showSize = selected ? 'size' in selected : !['spot', 'text', 'number', 'select'].includes(tool)
  const showColor = selected ? selected.kind !== 'spot' : tool !== 'spot'
  const pickColor = (value: string) => (selected ? props.onPatch({ color: value }) : props.onColor(value))

  return (
    <>
      <div className="photo-toolbar" role="toolbar" aria-label="사진 도구">
        {TOOL_GROUPS.map((group) => (
          <div key={group.name} className="photo-toolgroup" role="group" aria-label={group.name}>
            {group.tools.map(({ id, label, icon: ToolIcon }) => (
              <button key={id} type="button" className="photo-tool" aria-pressed={tool === id} onClick={() => props.onTool(id)}>
                <ToolIcon size={18} weight={tool === id ? 'bold' : 'regular'} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 문구만 바꾸고 줄은 늘 둔다. 줄이 생겼다 없어지면 사진 크기가 바뀌어 누르려던 자리가 어긋난다. */}
      <p className="photo-hint muted" aria-live="polite">
        {selected ? '고른 표시의 색 · 굵기를 바꾸거나 지웁니다. Delete 키로도 지웁니다.' : info.hint}
      </p>

      <div className="photo-props">
        {showColor && (
          <div className="photo-swatches" role="group" aria-label="색">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="photo-swatch"
                style={{ background: swatch }}
                aria-pressed={color.toLowerCase() === swatch}
                aria-label={COLOR_NAME[swatch]}
                title={COLOR_NAME[swatch]}
                onClick={() => pickColor(swatch)}
              />
            ))}
            <label className="photo-swatch photo-swatch--custom" title="다른 색">
              <span className="sr-only">다른 색</span>
              <input type="color" value={color} onChange={(event) => pickColor(event.target.value)} />
            </label>
          </div>
        )}

        {showSize && (
          <div className="seg photo-seg" role="group" aria-label="굵기">
            {([1, 2, 3] as const).map((level) => (
              <button key={level} type="button" aria-pressed={size === level} onClick={() => (selected ? props.onPatch({ size: level } as Partial<Mark>) : props.onSize(level))}>
                {SIZE_LABEL[level]}
              </button>
            ))}
          </div>
        )}

        {selected?.kind === 'text' && (
          <>
            <label className="photo-field">
              <span>글자</span>
              <input
                ref={textRef}
                className="field"
                type="text"
                value={selected.text}
                maxLength={MARK_LIMITS.maxText}
                placeholder="예: 손흥민"
                onChange={(event) => props.onPatch({ text: event.target.value } as Partial<Mark>)}
              />
            </label>
            <div className="seg photo-seg" role="group" aria-label="글자 모양">
              <button type="button" aria-pressed={selected.boxed} onClick={() => props.onPatch({ boxed: true } as Partial<Mark>)}>
                이름표
              </button>
              <button type="button" aria-pressed={!selected.boxed} onClick={() => props.onPatch({ boxed: false } as Partial<Mark>)}>
                글자만
              </button>
            </div>
          </>
        )}

        {selected?.kind === 'number' && (
          <label className="photo-field photo-field--short">
            <span>번호</span>
            <input
              className="field"
              type="number"
              min={1}
              max={MARK_LIMITS.maxNumber}
              value={selected.value}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value))
                if (value >= 1 && value <= MARK_LIMITS.maxNumber) props.onPatch({ value } as Partial<Mark>)
              }}
            />
          </label>
        )}

        <span className="photo-spacer" />

        <button type="button" className="icon-btn" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo}>
          <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.onRedo}>
          <ArrowClockwiseIcon size={18} aria-hidden="true" />
        </button>
        {selected ? (
          <button type="button" className="btn btn-danger" onClick={props.onDelete}>
            <TrashIcon size={16} aria-hidden="true" />
            지우기
          </button>
        ) : (
          <button type="button" className="btn" disabled={!props.hasMarks} onClick={props.onClear}>
            모두 지우기
          </button>
        )}
      </div>
    </>
  )
}
