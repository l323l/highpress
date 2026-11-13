import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { XIcon } from '../../components/icons'
import { getSetting, setSetting } from '../../db/store'

// naver: 내보내기 창의 "네이버 카페에 바로 올리기"를 처음 볼 때
export type GuideTab = 'stats' | 'motion' | 'video' | 'photo' | 'naver'

// 탭마다 안내를 한 번 닫았는지. 이 브라우저에 적어 두고 다시 띄우지 않는다.
export const guideKey = (tab: GuideTab) => `guideSeen:${tab}`

// 스탯: 항목을 고른다 → 도표가 그려진다 → 본문에 넣는다.
function StatsDemo() {
  return (
    <div className="demo demo-stats">
      <div className="demo-chips">
        <span>순위표</span>
        <span className="demo-chip-pick">득점 순위</span>
        <span>경기 스탯 비교</span>
      </div>
      <div className="demo-bars">
        {[
          ['홀란', 100, 24],
          ['살라', 79, 19],
          ['이삭', 67, 16],
          ['왓킨스', 54, 13],
        ].map(([name, width, goals], index) => (
          <div key={name} className="demo-bar-row">
            <span>{name}</span>
            <i style={{ width: `${width}%`, animationDelay: `${index * 0.12}s` }} />
            <b>{goals}</b>
          </div>
        ))}
      </div>
      <div className="demo-insert">
        <span className="demo-done">본문에 표로 들어갔습니다</span>
        <span className="demo-button">본문에 넣기</span>
      </div>
    </div>
  )
}

// 모션: 선수를 놓는다 → 움직일 곳을 정한다 → 재생하면 선수가 움직인다.
function MotionDemo() {
  return (
    <svg className="demo demo-motion" viewBox="0 0 320 180" role="presentation">
      <rect className="demo-pitch" width="320" height="180" rx="12" />
      <g className="demo-lines">
        <rect x="14" y="12" width="292" height="156" rx="2" />
        <line x1="160" y1="12" x2="160" y2="168" />
        <circle cx="160" cy="90" r="26" />
        <rect x="262" y="48" width="44" height="84" />
        <rect x="14" y="48" width="44" height="84" />
      </g>
      <circle className="demo-away" cx="232" cy="92" r="9" />
      <circle className="demo-away" cx="250" cy="42" r="9" />
      <circle className="demo-home" cx="74" cy="56" r="9" />
      <circle className="demo-home" cx="128" cy="132" r="9" />
      <path className="demo-arrow" d="M100 108 L212 62" pathLength="100" />
      <path className="demo-arrowhead" d="M214 61 l-12 -1 l5 10 z" />
      <circle className="demo-target" cx="220" cy="58" r="9" />
      <g className="demo-mover">
        <circle className="demo-home" cx="90" cy="112" r="9" />
        <circle className="demo-grab" cx="90" cy="112" r="15" />
      </g>
      <g className="demo-play">
        <rect x="12" y="150" width="58" height="20" rx="10" />
        <path d="M24 155 l8 5 l-8 5 z" />
        <text x="37" y="164">재생</text>
      </g>
    </svg>
  )
}

// 영상: 구간을 자른다 → 선수를 누른 채 따라가면 표시가 붙는다 → 배속·GIF 로 넣는다.
function VideoDemo() {
  return (
    <svg className="demo demo-video" viewBox="0 0 320 180" role="presentation">
      <rect className="demo-screen" width="320" height="180" rx="12" />
      <g className="demo-lines">
        <line x1="0" y1="118" x2="320" y2="96" />
        <line x1="0" y1="44" x2="320" y2="30" />
        <line x1="150" y1="37" x2="186" y2="106" />
      </g>
      <circle className="demo-extra" cx="70" cy="60" r="6" />
      <circle className="demo-extra" cx="246" cy="84" r="6" />
      <circle className="demo-extra" cx="196" cy="52" r="6" />
      <g className="demo-runner">
        <circle className="demo-ring" cx="78" cy="92" r="15" />
        <circle className="demo-player" cx="78" cy="92" r="6" />
      </g>
      <g className="demo-badges">
        <g className="demo-badge demo-badge-speed">
          <rect x="216" y="12" width="44" height="20" rx="10" />
          <text x="238" y="26">0.5x</text>
        </g>
        <g className="demo-badge demo-badge-gif">
          <rect x="266" y="12" width="42" height="20" rx="10" />
          <text x="287" y="26">GIF</text>
        </g>
      </g>
      <g className="demo-timeline">
        <rect className="demo-track" x="16" y="150" width="288" height="14" rx="4" />
        <rect className="demo-cut demo-cut-left" x="16" y="150" width="62" height="14" rx="4" />
        <rect className="demo-cut demo-cut-right" x="252" y="150" width="52" height="14" rx="4" />
        <rect className="demo-handle demo-handle-left" x="16" y="146" width="4" height="22" rx="2" />
        <rect className="demo-handle demo-handle-right" x="300" y="146" width="4" height="22" rx="2" />
      </g>
    </svg>
  )
}

// 사진: 두 장을 붙인다 → 선수 원 · 곡선 화살표 · 이름표를 그린다 → 본문에 넣는다.
function PhotoDemo() {
  return (
    <svg className="demo demo-photoedit" viewBox="0 0 320 180" role="presentation">
      <rect className="demo-desk" width="320" height="180" rx="12" />
      <g className="demo-pe-a">
        <rect className="demo-pe-shot" x="22" y="28" width="136" height="112" rx="6" />
        <line className="demo-pe-turf" x1="22" y1="104" x2="158" y2="92" />
        <circle className="demo-extra" cx="70" cy="86" r="5" />
        <circle className="demo-extra" cx="118" cy="98" r="5" />
      </g>
      <g className="demo-pe-b">
        <rect className="demo-pe-shot" x="162" y="28" width="136" height="112" rx="6" />
        <line className="demo-pe-turf" x1="162" y1="96" x2="298" y2="108" />
        <circle className="demo-player" cx="206" cy="102" r="5" />
        <circle className="demo-extra" cx="262" cy="84" r="5" />
      </g>
      <g className="demo-pe-marks">
        <ellipse className="demo-pe-ring" cx="206" cy="110" rx="17" ry="5.5" />
        <path className="demo-pe-arrow" d="M214 98 Q 238 62 270 76" />
        <path className="demo-pe-head" d="M276 79 l-10 -8 l-2 10 z" />
        <g className="demo-pe-tag">
          <rect x="52" y="52" width="58" height="20" rx="6" />
          <text x="81" y="66">손흥민</text>
        </g>
      </g>
      <g className="demo-pe-insert">
        <rect x="226" y="148" width="74" height="22" rx="11" />
        <text x="263" y="163">본문에 넣기</text>
      </g>
    </svg>
  )
}

// 네이버 카페: 사진은 글 맨 위에 붙으니 자리로 옮긴다 → 로그인할 때 카페 글쓰기에 동의한다 → 연달아 올릴 수 없다.
function NaverDemo() {
  return (
    <svg className="demo demo-naver" viewBox="0 0 320 180" role="presentation">
      <rect className="demo-desk" width="320" height="180" rx="12" />
      <rect className="demo-sheet" x="24" y="12" width="150" height="156" rx="8" />
      <rect className="demo-photo demo-photo-b" x="104" y="22" width="60" height="34" rx="4" />
      <g className="demo-textlines">
        <rect x="34" y="66" width="130" height="5" rx="2.5" />
        <rect x="34" y="77" width="104" height="5" rx="2.5" />
        <rect x="34" y="138" width="130" height="5" rx="2.5" />
        <rect x="34" y="149" width="84" height="5" rx="2.5" />
      </g>
      <rect className="demo-slot" x="34" y="92" width="60" height="34" rx="4" />
      <text className="demo-slot-text" x="64" y="113">사진 1</text>
      <rect className="demo-photo demo-photo-a" x="34" y="22" width="60" height="34" rx="4" />
      <g className="demo-consent">
        <rect x="188" y="34" width="116" height="34" rx="8" />
        <rect className="demo-check-box" x="198" y="44" width="14" height="14" rx="3" />
        <path className="demo-check" d="M201 51 l3 3 l6 -7" />
        <text x="220" y="55">카페 글쓰기</text>
      </g>
      <g className="demo-wait">
        <rect x="188" y="108" width="116" height="34" rx="17" />
        <circle cx="206" cy="125" r="7" />
        <path d="M206 121 v4 l3 2" />
        <text x="220" y="129">1~2분 뒤 다시</text>
      </g>
    </svg>
  )
}

interface Guide {
  title: string
  demo: ReactNode
  steps: { title: string; text: string }[]
}

const GUIDES: Record<GuideTab, Guide> = {
  stats: {
    title: '스탯을 도표로 만들어 글에 넣습니다',
    demo: <StatsDemo />,
    steps: [
      { title: '리그와 항목을 고릅니다', text: '순위표 · 득점 순위 · 최근 경기 결과 · 경기 스탯 비교 가운데 고릅니다.' },
      { title: '도표로 미리 봅니다', text: '넣을 항목과 표시 범위(상위 5 · 상위 10 · 전체)를 바꾸면 바로 반영됩니다.' },
      { title: '본문에 넣기를 누릅니다', text: '출처와 조회일이 함께 적힌 표로 들어갑니다. 더 세부적인 스탯은 추천 사이트에서 찾습니다.' },
    ],
  },
  motion: {
    title: '선수의 움직임을 짧은 영상으로 만듭니다',
    demo: <MotionDemo />,
    steps: [
      { title: '선수를 끌어 처음 자리에 놓습니다', text: '포메이션 적용을 누르면 한 번에 배치됩니다.' },
      { title: '도착 위치에서 움직일 곳으로 옮깁니다', text: '화살표 · 선 · 원을 그려 설명을 더할 수 있습니다.' },
      { title: '재생해 보고 본문에 넣습니다', text: '장면을 더하면 움직임이 이어집니다. GIF · MP4 · PNG로 넣거나 내려받습니다.' },
    ],
  },
  naver: {
    title: '네이버 카페에 올리기 전에 알아 두세요',
    demo: <NaverDemo />,
    steps: [
      { title: '사진은 글 맨 위에 붙습니다', text: '올린 뒤 카페에서 수정을 눌러 본문의 [사진 번호] 자리로 옮겨 주세요. 사진은 10장까지이고 영상은 올라가지 않습니다.' },
      { title: '로그인할 때 “카페 글쓰기”에 동의합니다', text: '글은 로그인한 네이버 계정의 이름으로 올라갑니다. 가입했고 글을 쓸 수 있는 게시판에만 올릴 수 있습니다.' },
      { title: '연달아 올릴 수 없습니다', text: '네이버가 막습니다. 1~2분 뒤 다시 눌러 주세요. 올린 글을 고치려면 카페에서 수정합니다.' },
    ],
  },
  video: {
    title: '경기 영상에서 필요한 장면만 잘라 넣습니다',
    demo: <VideoDemo />,
    steps: [
      { title: '영상을 불러와 시작과 끝을 정합니다', text: '영상은 이 기기 안에서만 처리되고 어디에도 올라가지 않습니다.' },
      { title: '선수를 누른 채 따라갑니다', text: '누르고 있는 동안 원이나 조명이 선수를 따라붙도록 기록됩니다.' },
      { title: '배속을 고르고 본문에 넣습니다', text: '느리게 · 빠르게, 소리 제거를 고른 뒤 GIF나 MP4로 넣습니다.' },
    ],
  },
  photo: {
    title: '경기 사진에 화살표와 이름표를 그립니다',
    demo: <PhotoDemo />,
    steps: [
      { title: '사진을 불러오거나 두 장을 붙입니다', text: '두 장은 좌우나 위아래로 붙여 한 장으로 만듭니다. 사진은 이 기기 안에서만 처리됩니다.' },
      { title: '도구를 골라 사진 위에서 끕니다', text: '패스 · 움직임 · 곡선 침투 · 드리블 화살표, 선수 원, 조명, 공간, 이름표, 번호가 있습니다.' },
      { title: '본문에 넣습니다', text: '그린 표시까지 한 장의 JPG로 들어갑니다. 고른 표시는 모서리를 끌어 크기를 바꿉니다.' },
    ],
  },
}

// 스탯 · 모션 · 영상 · 사진 탭을 처음 눌렀을 때, 그리고 네이버 카페에 바로 올리기를 처음 볼 때 한 번씩 뜨는 사용법 안내.
// 위의 예시 그림과 아래의 세 단계가 같은 박자로 돈다 (한 바퀴 9초, 단계마다 3초).
export function TabGuide({ tab }: { tab: GuideTab }) {
  // undefined: 읽는 중 (그동안은 띄우지 않는다)
  const seen = useLiveQuery(() => getSetting<boolean>(guideKey(tab), false), [tab])
  const open = seen === false
  const panel = useRef<HTMLDivElement>(null)
  const close = useCallback(() => void setSetting(guideKey(tab), true), [tab])

  // 열리면 창 안으로 초점을 옮기고, 닫히면 열기 전에 있던 자리로 돌려준다. Esc 로 닫는다.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // 이 안내만 닫는다. 아래에 열려 있는 창(내보내기 등)까지 함께 닫히지 않게 한다.
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus()
    }
  }, [open, close])

  if (!open) return null
  const guide = GUIDES[tab]

  return (
    <div className="guide-backdrop" onClick={close}>
      <div ref={panel} className="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="guide-close" aria-label="안내 닫기" title="닫기" onClick={close}>
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        <h2 id="guide-title" className="guide-title">
          {guide.title}
        </h2>
        <div className="guide-stage" aria-hidden="true">
          {guide.demo}
        </div>
        <ol className="guide-steps">
          {guide.steps.map((step, index) => (
            <li key={step.title}>
              <span className="guide-num" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p className="muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="guide-foot">
          <p className="muted">이 안내는 한 번만 보입니다.</p>
          <button type="button" className="btn btn-primary" onClick={close}>
            알겠습니다
          </button>
        </div>
      </div>
    </div>
  )
}
