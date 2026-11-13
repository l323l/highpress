import { getSetting, setSetting } from '../../db/store'

// 글을 올릴 곳: 카페의 고유번호와 게시판 번호.
export interface CafeTarget {
  clubId: string
  menuId: string
  // 사용자가 알아볼 이름. 붙여 넣은 주소에서는 카페 이름을 알 수 없어 번호로 짓는다.
  label: string
}

const TARGETS_KEY = 'naverCafeTargets'
const MAX_TARGETS = 5

// 게시판 주소에서 카페 고유번호와 게시판 번호를 읽는다. 읽지 못하면 null.
// 새 주소: https://cafe.naver.com/f-e/cafes/31802525/menus/1
// 옛 주소: https://cafe.naver.com/ArticleList.nhn?search.clubid=31802525&search.menuid=1
export function parseCafeBoard(input: string): Pick<CafeTarget, 'clubId' | 'menuId'> | null {
  const text = input.trim()
  if (!/^https?:\/\/(m\.)?cafe\.naver\.com\//i.test(text)) return null
  const path = /\/cafes\/(\d{1,12})\/menus\/(\d{1,9})(?:[/?#]|$)/.exec(text)
  if (path) return { clubId: path[1], menuId: path[2] }
  const club = /[?&](?:search\.)?clubid=(\d{1,12})(?:&|#|$)/i.exec(text)
  const menu = /[?&](?:search\.)?menuid=(\d{1,9})(?:&|#|$)/i.exec(text)
  return club && menu ? { clubId: club[1], menuId: menu[1] } : null
}

export const targetLabel = (target: Pick<CafeTarget, 'clubId' | 'menuId'>) => `카페 ${target.clubId} · 게시판 ${target.menuId}`

function isTarget(value: unknown): value is CafeTarget {
  const target = value as Partial<CafeTarget> | null
  return !!target && typeof target === 'object' && /^\d{1,12}$/.test(String(target.clubId)) && /^\d{1,9}$/.test(String(target.menuId)) && typeof target.label === 'string'
}

// 전에 올렸던 곳들. 최근 것이 앞에 온다.
export async function recentTargets(): Promise<CafeTarget[]> {
  const saved = await getSetting<unknown>(TARGETS_KEY, [])
  return Array.isArray(saved) ? saved.filter(isTarget).slice(0, MAX_TARGETS) : []
}

export async function rememberTarget(target: CafeTarget): Promise<void> {
  const others = (await recentTargets()).filter((item) => item.clubId !== target.clubId || item.menuId !== target.menuId)
  await setSetting(TARGETS_KEY, [target, ...others].slice(0, MAX_TARGETS))
}
