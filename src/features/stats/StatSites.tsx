import { useState } from 'react'
import { NEEDS, sitesFor, type Need } from '@highpress/core/stats'

// 스탯을 직접 찾아볼 사이트 추천. 찾는 스탯을 고르면 맞는 사이트만 남는다.
export function StatSites() {
  const [need, setNeed] = useState<Need | null>(null)
  const sites = sitesFor(need)

  return (
    <div className="stat-sites">
      <header className="stat-sites-head">
        <h3>어떤 스탯을 찾고 있나요?</h3>
        <p className="muted">글에 필요한 숫자에 따라 볼 곳이 다릅니다. 찾는 것을 고르면 맞는 사이트를 추려 드립니다.</p>
      </header>

      <div className="stat-needs" role="group" aria-label="찾는 스탯">
        <button type="button" className="chip" aria-pressed={need === null} onClick={() => setNeed(null)}>
          전체
        </button>
        {NEEDS.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={need === item.id} onClick={() => setNeed(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <ul className="stat-site-list">
        {sites.map((site, index) => (
          <li key={site.name} className="stat-site" style={{ animationDelay: `${index * 45}ms` }}>
            <div className="stat-site-top">
              <div>
                <h4>{site.name}</h4>
                {site.tagline && <p className="stat-site-tagline">{site.tagline}</p>}
              </div>
              <a className="btn stat-site-link" href={site.url} target="_blank" rel="noopener noreferrer">
                사이트 열기<span aria-hidden="true"> ↗</span>
                <span className="sr-only"> (새 창)</span>
              </a>
            </div>
            {site.comment && <p className="stat-site-comment">{site.comment}</p>}
            {site.stats.length > 0 && (
              <ul className="stat-site-tags" aria-label={`${site.name}에서 볼 만한 스탯`}>
                {site.stats.map((stat) => (
                  <li key={stat}>{stat}</li>
                ))}
              </ul>
            )}
            {site.caveat && <p className="stat-site-caveat">알아 둘 점 · {site.caveat}</p>}
          </li>
        ))}
      </ul>

      <p className="muted stat-sites-note">
        외부 사이트이며 이 앱과 관계가 없습니다. 수치를 인용할 때는 출처를 밝히고, 화면을 캡처해 쓰기 전에 각 사이트의 이용 조건을 확인하세요.
      </p>
    </div>
  )
}
