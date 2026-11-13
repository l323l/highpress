import { useState } from 'react'
import { saveTeam } from '../../db/store'
import type { Team } from '@highpress/core/db'

const NEW_TEAM = '__new__'

interface Props {
  teams: Team[]
  value: string | null
  onChange: (teamId: string | null) => void
}

export function TeamSelect({ teams, value, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#12b886')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const team = await saveTeam({ name: trimmed, color })
    onChange(team.id)
    setName('')
    setAdding(false)
  }

  if (adding) {
    return (
      <form className="team-select" onSubmit={add}>
        <label className="sr-only" htmlFor="editor-team-name">
          새 팀 이름
        </label>
        <input id="editor-team-name" className="field" placeholder="새 팀 이름" value={name} maxLength={30} autoFocus onChange={(e) => setName(e.target.value)} />
        <label className="sr-only" htmlFor="editor-team-color">
          팀 색상
        </label>
        <input id="editor-team-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button type="submit" className="btn" disabled={!name.trim()}>
          추가
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
          취소
        </button>
      </form>
    )
  }

  return (
    <div className="team-select">
      <label className="sr-only" htmlFor="editor-team">
        팀 태그
      </label>
      <select
        id="editor-team"
        className="field"
        value={teams.some((t) => t.id === value) ? value! : ''}
        onChange={(e) => (e.target.value === NEW_TEAM ? setAdding(true) : onChange(e.target.value || null))}
      >
        <option value="">팀 없음</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value={NEW_TEAM}>+ 새 팀</option>
      </select>
    </div>
  )
}
