import { TACTIC_LIMITS, type TacticProject, type TeamSide } from '@highpress/core/db'
import type { Selection, Tool } from './Board'
import { DEFAULT_PITCH_COLOR, TOKEN_SCALE } from '@highpress/core/tactics'

const TOOLS: { label: string; tool: Tool }[] = [
  { label: '이동', tool: null },
  { label: '→ 화살표', tool: { kind: 'arrow', dashed: false } },
  { label: '⇢ 점선 화살표', tool: { kind: 'arrow', dashed: true } },
  { label: '─ 선', tool: { kind: 'line', dashed: false } },
  { label: '┄ 점선', tool: { kind: 'line', dashed: true } },
  { label: '○ 원', tool: { kind: 'ellipse', dashed: false } },
  { label: '◌ 점선 원', tool: { kind: 'ellipse', dashed: true } },
]

const sameTool = (a: Tool, b: Tool) => a?.kind === b?.kind && a?.dashed === b?.dashed

interface BoardToolsProps {
  project: TacticProject
  disabled: boolean
  tool: Tool
  shapeColor: string
  shapeCount: number
  selection: Selection | null
  onTool: (tool: Tool) => void
  onShapeColor: (color: string) => void
  onDeleteShape: () => void
  onClearShapes: () => void
  onPitchColor: (color: string) => void
  onTeamColor: (team: TeamSide, color: string) => void
  onTokenName: (tokenId: string, name: string) => void
  onTokenColor: (tokenId: string, color: string | null) => void
  onTokenScale: (scale: number) => void
  onPlayerScale: (tokenId: string, scale: number | null) => void
  onResetScale: () => void
}

const percent = (scale: number | undefined) => Math.round((scale ?? 1) * 100)

// 도형 도구와 색·선수 설정. 조작은 모두 현재 장면에 적용된다.
export function BoardTools(props: BoardToolsProps) {
  const { project, disabled, selection } = props
  const token = selection?.type === 'token' ? project.tokens.find((item) => item.id === selection.id) : undefined

  return (
    <>
      <div className="tactics-row" role="group" aria-label="도형 도구">
        {TOOLS.map(({ label, tool }) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={sameTool(tool, props.tool)}
            disabled={disabled}
            onClick={() => props.onTool(tool)}
          >
            {label}
          </button>
        ))}
        <label className="tactics-color">
          <span>도형 색</span>
          <input type="color" value={props.shapeColor} disabled={disabled} onChange={(event) => props.onShapeColor(event.target.value)} />
        </label>
        <button type="button" className="btn btn-danger" disabled={disabled || selection?.type !== 'shape'} onClick={props.onDeleteShape}>
          선택한 도형 삭제
        </button>
        <button type="button" className="btn" disabled={disabled || props.shapeCount === 0} onClick={props.onClearShapes}>
          도형 모두 지우기
        </button>
        {/* 문구만 바꾸고 자리는 항상 둔다. 줄이 생겼다 없어지면 전술판 크기가 바뀌어 누르려던 자리가 어긋난다. */}
        <span className="muted tactics-hint">{props.tool ? '전술판 위에서 끌어서 그립니다.' : '도형을 누르면 고르고, 끌면 옮깁니다.'}</span>
      </div>

      <div className="tactics-row" role="group" aria-label="색과 선수">
        <label className="tactics-color">
          <span>배경색</span>
          <input
            type="color"
            value={project.pitchColor ?? DEFAULT_PITCH_COLOR}
            disabled={disabled}
            onChange={(event) => props.onPitchColor(event.target.value)}
          />
        </label>
        {(['a', 'b'] as const).map((team) => (
          <label key={team} className="tactics-color">
            <span>팀 {team.toUpperCase()} 색</span>
            <input
              type="color"
              value={project.teamColors[team]}
              disabled={disabled}
              onChange={(event) => props.onTeamColor(team, event.target.value)}
            />
          </label>
        ))}
        {/* 선수 칸은 항상 보이고, 선수를 고르기 전에는 꺼 둔다 (같은 이유로 높이를 바꾸지 않는다). */}
        <label className="tactics-color">
          <span>선수 이름</span>
          <input
            className="field tactics-name"
            type="text"
            value={token?.name ?? ''}
            maxLength={TACTIC_LIMITS.maxNameLength}
            placeholder={token ? '이름' : '선수를 누르세요'}
            disabled={disabled || !token}
            onChange={(event) => token && props.onTokenName(token.id, event.target.value)}
          />
        </label>
        <label className="tactics-color">
          <span>선수 색</span>
          <input
            type="color"
            value={token ? (token.color ?? project.teamColors[token.team]) : '#000000'}
            disabled={disabled || !token}
            onChange={(event) => token && props.onTokenColor(token.id, event.target.value)}
          />
        </label>
        <button type="button" className="btn" disabled={disabled || !token?.color} onClick={() => token && props.onTokenColor(token.id, null)}>
          팀 색으로
        </button>
      </div>

      <div className="tactics-row" role="group" aria-label="선수 크기">
        <label className="tactics-color tactics-size">
          <span>전체 선수 크기 {percent(project.tokenScale)}%</span>
          <input
            type="range"
            min={TOKEN_SCALE.min * 100}
            max={TOKEN_SCALE.max * 100}
            step={5}
            value={percent(project.tokenScale)}
            disabled={disabled}
            onChange={(event) => props.onTokenScale(Number(event.target.value) / 100)}
          />
        </label>
        {/* 선수를 고르기 전에도 자리는 둔다 (높이를 바꾸지 않는다). */}
        <label className="tactics-color tactics-size">
          <span>{token ? `이 선수만 ${percent(token.scale)}%` : '이 선수만 (선수를 누르세요)'}</span>
          <input
            type="range"
            min={TOKEN_SCALE.min * 100}
            max={TOKEN_SCALE.max * 100}
            step={5}
            value={percent(token?.scale)}
            disabled={disabled || !token}
            onChange={(event) => token && props.onPlayerScale(token.id, Number(event.target.value) / 100)}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={disabled || (project.tokenScale === undefined && !project.tokens.some((item) => item.scale !== undefined))}
          onClick={props.onResetScale}
        >
          기본 크기로
        </button>
      </div>
    </>
  )
}
