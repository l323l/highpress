// 글꼴은 기기에 설치된 것을 쓴다. 외부 글꼴 파일은 불러오지 않는다.
export const FONT_FAMILIES = [
  { label: '나눔고딕', value: "'Nanum Gothic', '나눔고딕', sans-serif" },
  { label: '나눔명조', value: "'Nanum Myeongjo', '나눔명조', serif" },
  { label: '맑은 고딕', value: "'Malgun Gothic', '맑은 고딕', sans-serif" },
  { label: '굴림', value: "Gulim, '굴림', sans-serif" },
  { label: '바탕', value: "Batang, '바탕', serif" },
]

export const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36].map((px) => `${px}px`)

export const LINE_HEIGHTS = ['1.0', '1.2', '1.5', '1.8', '2.0', '2.5']

export const ALIGNMENTS = [
  { value: 'left', label: '왼쪽 정렬', glyph: '좌' },
  { value: 'center', label: '가운데 정렬', glyph: '중' },
  { value: 'right', label: '오른쪽 정렬', glyph: '우' },
  { value: 'justify', label: '양쪽 정렬', glyph: '양' },
] as const

// 글자색 프리셋. 흰 바탕과 네이버 블로그에서 모두 읽히는 진한 색으로 골랐다.
// value 가 null 인 검정은 색을 지워 기본색으로 돌린다.
export const TEXT_COLORS: readonly { label: string; value: string | null; swatch: string }[] = [
  { label: '검정', value: null, swatch: '#16181d' },
  { label: '회색', value: '#6b7280', swatch: '#6b7280' },
  { label: '빨강', value: '#d92d20', swatch: '#d92d20' },
  { label: '주황', value: '#d9590b', swatch: '#d9590b' },
  { label: '초록', value: '#16803c', swatch: '#16803c' },
  { label: '파랑', value: '#1c64d9', swatch: '#1c64d9' },
  { label: '남색', value: '#1e3a8a', swatch: '#1e3a8a' },
  { label: '보라', value: '#7c3aed', swatch: '#7c3aed' },
]

export const DEFAULT_TEXT_COLOR = '#16181d'
export const DEFAULT_HIGHLIGHT_COLOR = '#fff3bf'

// <input type="color">는 #rrggbb만 받는다.
export function toColorInputValue(color: unknown, fallback: string): string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}
