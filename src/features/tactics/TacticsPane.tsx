import { useState } from 'react'
import type { TeamSide } from '@highpress/core/db'
import { newId } from '../../db/db'
import type { TacticDragPayload } from '@highpress/core/body'
import {
  positionsAt,
  sceneIndexAt,
  sceneRangeMs,
  sceneStart,
  FORMATION_IDS,
  type FormationId,
  addScene,
  addShape,
  applyFormation,
  clearShapes,
  DEFAULT_SHAPE_COLOR,
  deleteScene,
  deleteShape,
  moveShape,
  moveToken,
  setPitchColor,
  setSceneDuration,
  setShapeColor,
  setTeamColor,
  resetScales,
  setPlayerScale,
  setTokenColor,
  setTokenScale,
  setTokenName,
  type Phase,
} from '@highpress/core/tactics'
import { Board, type Selection, type Tool } from './Board'
import { BoardTools } from './BoardTools'
import { ExportBar } from './ExportBar'
import { SceneStrip } from './SceneStrip'
import { usePlayback } from './usePlayback'
import { useTacticProject } from './useTacticProject'
import './tactics.css'

const TEAMS: { side: TeamSide; label: string }[] = [
  { side: 'a', label: '팀 A' },
  { side: 'b', label: '팀 B' },
]

export interface TacticsPaneProps {
  columnId: string
  onInsert?: (payload: TacticDragPayload) => void
}

export function TacticsPane({ columnId, onInsert }: TacticsPaneProps) {
  const { project, failed, saveFailed, update, flush } = useTacticProject(columnId)
  const [selected, setSelected] = useState(0)
  // 처음 열면 첫 장면의 시작 위치부터 잡는다.
  const [phase, setPhase] = useState<Phase>('start')
  const [tool, setTool] = useState<Tool>(null)
  const [shapeColor, setShapeColor_] = useState(DEFAULT_SHAPE_COLOR)
  const [selection, setSelection] = useState<Selection | null>(null)
  const { timeMs, playing, play, stop } = usePlayback(project)

  if (failed) {
    return (
      <div className="tactics-pane">
        <p role="alert">전술판을 불러오지 못했습니다.</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="tactics-pane">
        <p className="muted">전술판을 불러오는 중…</p>
      </div>
    )
  }

  const sceneIndex = Math.min(selected, project.scenes.length - 1)
  const scene = project.scenes[sceneIndex]
  const start = sceneStart(project, sceneIndex)
  const shownIndex = timeMs === null ? sceneIndex : sceneIndexAt(project, timeMs)
  const positions = timeMs !== null ? positionsAt(project, timeMs) : phase === 'start' ? start : scene.positions
  const shapes = project.scenes[shownIndex]?.shapes ?? []
  // 둘째 장면부터의 시작 위치는 앞 장면의 도착 위치라서 여기서는 보기만 한다.
  const editable = !playing && (phase === 'end' || sceneIndex === 0)

  // 장면을 바꾸면 그 장면의 움직임(도착 위치)을 만들 차례다. 도형 선택은 의미가 없어지고, 선수 선택은 유지한다.
  const selectScene = (index: number) => {
    setSelected(index)
    setPhase('end')
    setSelection((current) => (current?.type === 'shape' ? null : current))
  }

  return (
    <div className="tactics-pane">
      <div className="tactics-row">
        {TEAMS.map(({ side, label }) => (
          <label key={side} className="tactics-team">
            <span className="tactics-swatch" style={{ background: project.teamColors[side] }} />
            <span>{label}</span>
            <select
              className="field"
              aria-label={`${label} 포메이션`}
              value=""
              disabled={!editable}
              onChange={(event) => {
                const formation = event.target.value as FormationId
                if (FORMATION_IDS.includes(formation)) update((p) => applyFormation(p, sceneIndex, side, formation, phase))
              }}
            >
              <option value="">포메이션 적용</option>
              {FORMATION_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="tactics-spacer" />
        {playing ? (
          <button type="button" className="btn btn-primary" onClick={stop}>
            정지
          </button>
        ) : (
          <>
            <button type="button" className="btn" title="지금 고른 장면의 움직임만 재생합니다" onClick={() => play(sceneRangeMs(project, sceneIndex))}>
              장면 재생
            </button>
            <button type="button" className="btn btn-primary" title="만든 장면을 처음부터 끝까지 이어서 재생합니다" onClick={() => play()}>
              전체 재생
            </button>
          </>
        )}
      </div>

      <Board
        project={project}
        positions={positions}
        shapes={shapes}
        ghost={!playing && phase === 'end' ? start : undefined}
        draggable={editable}
        tool={tool}
        shapeColor={shapeColor}
        selection={playing ? null : selection}
        onMoveToken={(tokenId, point) => update((p) => moveToken(p, sceneIndex, tokenId, point, phase))}
        onSelect={setSelection}
        onAddShape={(shape) => {
          update((p) => addShape(p, sceneIndex, shape, newId))
          // 하나 그리면 이동 도구로 돌아가 바로 선수를 옮길 수 있게 한다.
          setTool(null)
        }}
        onMoveShape={(shapeId, dx, dy) => update((p) => moveShape(p, sceneIndex, shapeId, dx, dy))}
      />

      <BoardTools
        project={project}
        disabled={playing}
        tool={tool}
        shapeColor={shapeColor}
        shapeCount={scene.shapes?.length ?? 0}
        selection={selection}
        onTool={setTool}
        onShapeColor={(color) => {
          setShapeColor_(color)
          if (selection?.type === 'shape') update((p) => setShapeColor(p, sceneIndex, selection.id, color))
        }}
        onDeleteShape={() => {
          if (selection?.type !== 'shape') return
          update((p) => deleteShape(p, sceneIndex, selection.id))
          setSelection(null)
        }}
        onClearShapes={() => {
          update((p) => clearShapes(p, sceneIndex))
          setSelection((current) => (current?.type === 'shape' ? null : current))
        }}
        onPitchColor={(color) => update((p) => setPitchColor(p, color))}
        onTeamColor={(team, color) => update((p) => setTeamColor(p, team, color))}
        onTokenName={(tokenId, name) => update((p) => setTokenName(p, tokenId, name))}
        onTokenColor={(tokenId, color) => update((p) => setTokenColor(p, tokenId, color))}
        onTokenScale={(scale) => update((p) => setTokenScale(p, scale))}
        onPlayerScale={(tokenId, scale) => update((p) => setPlayerScale(p, tokenId, scale))}
        onResetScale={() => update(resetScales)}
      />

      <SceneStrip
        scenes={project.scenes}
        selected={sceneIndex}
        phase={phase}
        disabled={playing}
        onSelect={selectScene}
        onPhase={setPhase}
        onAdd={() => {
          update((p) => addScene(p, sceneIndex, newId))
          selectScene(sceneIndex + 1)
        }}
        onDelete={() => {
          update((p) => deleteScene(p, sceneIndex))
          selectScene(Math.max(0, sceneIndex - 1))
        }}
        onDuration={(durationMs) => update((p) => setSceneDuration(p, sceneIndex, durationMs))}
      />

      <ExportBar project={project} sceneIndex={sceneIndex} flush={flush} onInsert={onInsert} />

      {saveFailed && (
        <p className="tactics-note tactics-error" role="alert">
          전술판을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.
        </p>
      )}
    </div>
  )
}
