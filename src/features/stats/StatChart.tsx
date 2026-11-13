import type { CSSProperties } from 'react'
import { sourceLine, type StatCell, type StatSnapshot } from '@highpress/core/stats'
import './stats.css'

interface Props {
  snapshot: StatSnapshot
}

// 행마다 조금씩 늦게 나타나게 하는 순번. CSS가 --i로 지연 시간을 계산한다.
const order = (index: number) => ({ '--i': index }) as CSSProperties

const isNumber = (cell: StatCell): cell is number => typeof cell === 'number'

function Table({ snapshot }: Props) {
  // 숫자 칸은 오른쪽으로 맞춘다. 첫 행을 보고 정한다.
  const numeric = snapshot.rows[0].map((cell) => isNumber(cell) || /^[+-]?\d/.test(String(cell)))
  const last = snapshot.columns.length - 1
  return (
    <table className="stat-table">
      <thead>
        <tr>
          {snapshot.columns.map((column, i) => (
            <th key={i} scope="col" className={numeric[i] ? 'stat-num' : undefined}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshot.rows.map((row, r) => (
          <tr key={r} className="stat-row" style={order(r)}>
            {row.map((cell, i) => (
              <td key={i} className={[numeric[i] ? 'stat-num' : '', i === last && numeric[i] ? 'stat-strong' : ''].join(' ').trim() || undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const amount = (cell: StatCell) => (isNumber(cell) ? cell : Number.parseFloat(String(cell)) || 0)
const percent = (value: number, max: number) => `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`

// 한 가지 값의 크기 비교: 이름 · 소속 · 막대 · 값
function Bars({ snapshot }: Props) {
  const max = Math.max(...snapshot.rows.map((row) => amount(row[2])))
  return (
    <ol className="stat-bars" aria-label={`${snapshot.columns[0]}별 ${snapshot.columns[2]}`}>
      {snapshot.rows.map(([name, team, value], r) => (
        <li key={r} className="stat-row stat-bar-row" style={order(r)} title={`${name} (${team}) — ${snapshot.columns[2]} ${value}`}>
          <span className="stat-bar-rank">{r + 1}</span>
          <span className="stat-bar-name">
            <strong>{name}</strong>
            <span className="stat-sub">{team}</span>
          </span>
          <span className="stat-bar-track">
            <span className="stat-bar-fill" style={{ width: percent(amount(value), max) }} />
          </span>
          <span className="stat-bar-value">{value}</span>
        </li>
      ))}
    </ol>
  )
}

// 두 팀 비교: 가운데 기준선에서 양쪽으로 뻗는 막대
function Versus({ snapshot }: Props) {
  const [home, away] = snapshot.teams!
  return (
    <div className="stat-versus">
      <div className="stat-legend">
        <span>
          <i className="stat-swatch stat-swatch--home" />
          {home}
        </span>
        <span>
          {away}
          <i className="stat-swatch stat-swatch--away" />
        </span>
      </div>
      <ul className="stat-versus-rows">
        {snapshot.rows.map(([label, a, b], r) => {
          const max = Math.max(amount(a), amount(b))
          return (
            <li key={r} className="stat-row" style={order(r)} title={`${label} — ${home} ${a}, ${away} ${b}`}>
              <div className="stat-versus-head">
                <span className="stat-versus-value">{a}</span>
                <span className="stat-versus-label">{label}</span>
                <span className="stat-versus-value">{b}</span>
              </div>
              <div className="stat-versus-bars">
                <span className="stat-bar-track stat-bar-track--home">
                  <span className="stat-bar-fill stat-bar-fill--home" style={{ width: percent(amount(a), max) }} />
                </span>
                <span className="stat-bar-track">
                  <span className="stat-bar-fill stat-bar-fill--away" style={{ width: percent(amount(b), max) }} />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 스탯 도표 한 장. 화면에 나타날 때 행과 막대가 차례로 자리 잡는다.
export function StatChart({ snapshot }: Props) {
  return (
    <figure className="stat-chart" data-view={snapshot.view}>
      <figcaption className="stat-caption">
        <strong className="stat-title">{snapshot.title}</strong>
        {snapshot.subtitle && <span className="stat-sub">{snapshot.subtitle}</span>}
      </figcaption>
      {snapshot.view === 'table' ? <Table snapshot={snapshot} /> : snapshot.view === 'bars' ? <Bars snapshot={snapshot} /> : <Versus snapshot={snapshot} />}
      <p className="stat-source">{sourceLine(snapshot)}</p>
    </figure>
  )
}
