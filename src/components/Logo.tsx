// 하이프레스 로고: H 의 가로대를 위로 끌어올려 골대이자 높이 올린 압박 라인으로 읽히게 했다. 아래의 점은 공이다.
// 색은 app.css 의 토큰을 쓴다 (밝은 화면: 먹색 바탕, 어두운 화면: 밝은 바탕).
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--text)" />
      <path d="M8.5 7.5h3.6v3.4h7.8V7.5h3.6v17h-3.6v-10h-7.8v10H8.5z" fill="var(--bg)" />
      <circle cx="16" cy="20.6" r="2.3" fill="var(--live-on-ink)" />
    </svg>
  )
}
