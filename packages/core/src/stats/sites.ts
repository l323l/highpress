// 스탯을 직접 찾아볼 때 쓸 만한 사이트 추천. 앱은 이 사이트들의 데이터를 가져오지 않고 링크만 건다.

export type Need = 'xg' | 'rating' | 'style' | 'match' | 'market'

export const NEEDS: { id: Need; label: string }[] = [
  { id: 'xg', label: 'xG · 기대 득점' },
  { id: 'rating', label: '선수 평점' },
  { id: 'style', label: '팀 스타일 · 전술 지표' },
  { id: 'match', label: '경기 한 판 분석' },
  { id: 'market', label: '이적 · 몸값 · 부상' },
]

export interface StatSite {
  name: string
  url: string
  // 한 줄 소개
  tagline: string
  // 어떤 글을 쓸 때 여는지
  comment: string
  // 여기서 볼 만한 스탯
  stats: string[]
  needs: Need[]
  // 알아 둘 점 (없으면 생략)
  caveat?: string
}

// 사이트별 특징은 요청자가 쓴 설명을 다듬은 것이다. tagline(한 줄 소개), comment(어떤 글에 쓰는지), stats(볼 만한 스탯 목록),
// caveat(알아 둘 점)를 채우면 카드에 나타나고, 비워 두면 그 줄은 보이지 않는다. 카드는 이 순서대로 놓인다.
export const STAT_SITES: StatSite[] = [
  {
    name: 'Sofascore',
    url: 'https://www.sofascore.com/',
    tagline: '가장 많이 쓰는 스탯 사이트. 처음 찾을 때는 여기부터',
    comment: '웬만한 스탯은 거의 다 있습니다. 자체 평점과 함께 히트맵 · 터치맵 · 패스맵을 보여 주고 팀 지표도 빠짐없이 나와서, 어떤 글이든 무난하게 참고할 수 있습니다.',
    stats: ['자체 평점', '히트맵', '터치맵', '패스맵', '팀 지표'],
    needs: ['rating', 'match', 'style'],
  },
  {
    name: 'Opta Analyst',
    url: 'https://theanalyst.com/',
    tagline: '팀 스탯과 세부 지표가 가장 자세한 곳',
    comment: '팀별 스탯을 깊이 들여다보거나, 리그끼리 스탯을 비교하는 글에 알맞습니다.',
    stats: ['팀 스탯', '세부 지표', '리그별 비교'],
    needs: ['xg', 'style'],
    caveat: '이번 시즌 자료만 있고 지난 시즌은 볼 수 없습니다.',
  },
  {
    name: 'WhoScored',
    url: 'https://www.whoscored.com/',
    tagline: '보고 싶은 선수와 지표만 골라 보는 곳',
    comment: '경기마다 터치 같은 지표를 손쉽게 볼 수 있습니다. 선수를 직접 골라 필요한 자료만 뽑아 볼 수 있어서, 몇몇 선수를 나란히 비교하는 글에 좋습니다.',
    stats: ['자체 평점', '경기별 터치', '선수 골라 보기'],
    needs: ['rating', 'match'],
    caveat: '요즘은 Sofascore와 FotMob도 비슷한 지표를 보여 줘서 예전만큼 독보적이지는 않습니다.',
  },
  {
    name: 'FotMob',
    url: 'https://www.fotmob.com/',
    tagline: '가볍고 무난하게 참고하는 곳',
    comment: 'Sofascore보다 자료는 적지만 자체 평점이 있고, 경기 흐름을 빠르게 훑어보기에 좋습니다.',
    stats: ['자체 평점', '경기 요약'],
    needs: ['xg', 'rating', 'match'],
  },
  {
    name: 'Transfermarkt',
    url: 'https://www.transfermarkt.com/',
    tagline: '이적 시장 가치와 부상 이력',
    comment: '선수의 몸값, 이적 기록, 부상 이력을 찾아보기 편합니다. 이적 소식이나 선수의 커리어를 다루는 글에 씁니다.',
    stats: ['시장 가치', '이적 기록', '부상 이력'],
    needs: ['market'],
  },
  {
    name: 'Understat',
    url: 'https://understat.com/',
    tagline: '다른 곳에 없는 지표를 찾을 때',
    comment: '큰 장점은 없지만, 위 사이트들에 없는 지표가 들어 있을 때가 있어 보조로 확인합니다.',
    stats: [],
    needs: ['xg', 'match'],
  },
]

export function sitesFor(need: Need | null): StatSite[] {
  return need ? STAT_SITES.filter((site) => site.needs.includes(need)) : STAT_SITES
}
