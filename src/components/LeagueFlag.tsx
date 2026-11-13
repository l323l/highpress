import type { ReactNode } from 'react'
import type { LeagueCountry } from '../lib/clubs'

// 리그가 열리는 나라의 국기를 작은 원으로 그린다.
// 국기 이모티콘은 Windows 에서 그림 대신 글자로 나와서 직접 그린다. 리그의 공식 로고가 아니다.
const FLAGS: Record<LeagueCountry, ReactNode> = {
  // 잉글랜드: 흰 바탕에 붉은 십자
  eng: (
    <>
      <rect width="20" height="20" fill="#ffffff" />
      <rect x="8" width="4" height="20" fill="#cf142b" />
      <rect y="8" width="20" height="4" fill="#cf142b" />
    </>
  ),
  // 스페인: 빨강 - 노랑 - 빨강
  esp: (
    <>
      <rect width="20" height="20" fill="#aa151b" />
      <rect y="5" width="20" height="10" fill="#f1bf00" />
    </>
  ),
  // 독일: 검정 - 빨강 - 금색
  ger: (
    <>
      <rect width="20" height="20" fill="#16161a" />
      <rect y="6.67" width="20" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="20" height="6.67" fill="#ffce00" />
    </>
  ),
  // 이탈리아: 초록 - 흰색 - 빨강
  ita: (
    <>
      <rect width="20" height="20" fill="#f4f5f0" />
      <rect width="6.67" height="20" fill="#008c45" />
      <rect x="13.33" width="6.67" height="20" fill="#cd212a" />
    </>
  ),
  // 프랑스: 파랑 - 흰색 - 빨강
  fra: (
    <>
      <rect width="20" height="20" fill="#ffffff" />
      <rect width="6.67" height="20" fill="#0055a4" />
      <rect x="13.33" width="6.67" height="20" fill="#ef4135" />
    </>
  ),
}

export function LeagueFlag({ country, size = 22 }: { country: LeagueCountry; size?: number }) {
  const clip = `flag-${country}`
  return (
    <svg className="league-flag" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <clipPath id={clip}>
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>{FLAGS[country]}</g>
      {/* 흰 국기가 밝은 바탕에 묻히지 않게 가는 테두리를 둔다. */}
      <circle cx="10" cy="10" r="9.5" fill="none" stroke="rgb(128 128 128 / 45%)" />
    </svg>
  )
}
