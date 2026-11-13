import { TACTIC_LIMITS, type Scene } from '@highpress/core/db'
import { MAX_DURATION_MS, MIN_DURATION_MS, type Phase } from '@highpress/core/tactics'

interface SceneStripProps {
  scenes: Scene[]
  selected: number
  phase: Phase
  disabled: boolean
  onSelect: (index: number) => void
  onPhase: (phase: Phase) => void
  onAdd: () => void
  onDelete: () => void
  onDuration: (durationMs: number) => void
}

const PHASES: { phase: Phase; label: string }[] = [
  { phase: 'start', label: '시작 위치' },
  { phase: 'end', label: '도착 위치' },
]

function hint(phase: Phase, isFirst: boolean): string {
  if (phase === 'end') return '이 장면에서 움직일 곳으로 선수를 끌어 옮기세요.'
  return isFirst ? '선수를 처음 자리에 놓으세요.' : '앞 장면의 도착 위치에서 이어집니다 (앞 장면에서 고칩니다).'
}

// 장면 하나는 한 번의 움직임(시작 위치 → 도착 위치)이다.
export function SceneStrip({ scenes, selected, phase, disabled, onSelect, onPhase, onAdd, onDelete, onDuration }: SceneStripProps) {
  const scene = scenes[selected]

  return (
    <>
      <div className="tactics-row tactics-scene-row">
        <div className="tactics-scenes" role="group" aria-label="장면">
          {scenes.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="chip"
              aria-pressed={i === selected}
              disabled={disabled}
              onClick={() => onSelect(i)}
            >
              장면 {i + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          disabled={disabled || scenes.length >= TACTIC_LIMITS.maxScenes}
          title={scenes.length >= TACTIC_LIMITS.maxScenes ? `장면은 ${TACTIC_LIMITS.maxScenes}개까지 만들 수 있습니다` : undefined}
          onClick={onAdd}
        >
          장면 추가
        </button>
        <button type="button" className="btn btn-danger" disabled={disabled || scenes.length <= 1} onClick={onDelete}>
          장면 삭제
        </button>
        <div className="tactics-scenes" role="group" aria-label="편집할 위치">
          {PHASES.map((item) => (
            <button
              key={item.phase}
              type="button"
              className="chip"
              aria-pressed={item.phase === phase}
              disabled={disabled}
              title={hint(item.phase, selected === 0)}
              onClick={() => onPhase(item.phase)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="muted tactics-hint">{hint(phase, selected === 0)}</span>
        <label className="tactics-duration">
          <span>이동 시간</span>
          <input
            type="range"
            min={MIN_DURATION_MS / 1000}
            max={MAX_DURATION_MS / 1000}
            step={0.1}
            value={scene.durationMs / 1000}
            disabled={disabled}
            onChange={(event) => onDuration(Number(event.target.value) * 1000)}
          />
          <span className="muted">{(scene.durationMs / 1000).toFixed(1)}초</span>
        </label>
      </div>
    </>
  )
}
