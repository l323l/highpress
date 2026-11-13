import type { CSSProperties } from 'react'
import type { Club } from '../lib/clubs'

// 구단 색과 약어로 그린 동그란 표시. 공식 엠블럼이 아니다. 모양은 app.css 의 .club-badge.
export function ClubBadge({ club, size = 48 }: { club: Club; size?: number }) {
  const style = {
    '--club-fill': club.fill,
    '--club-ink': club.ink,
    '--club-trim': club.trim,
    width: size,
    height: size,
    fontSize: Math.max(8, Math.round(size * 0.27)),
  } as CSSProperties
  return (
    <span className="club-badge" data-small={size < 32 || undefined} style={style} aria-hidden="true">
      {size >= 28 ? club.abbr : club.abbr[0]}
    </span>
  )
}
