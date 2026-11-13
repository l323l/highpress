import { getServer } from './supabase'

// 하루 방문자 세기 (0013_daily_visitors.sql). 로그인하지 않은 사람도 센다.
// 서버에는 방문자를 알아볼 값을 보내지 않는다. 이 브라우저가 마지막으로 센 날짜만 기기에 적어 두고,
// 날짜(한국 시간)가 바뀌기 전에는 다시 부르지 않는다.
export const VISIT_KEY = 'hp:visit-day'

// 'YYYY-MM-DD' (한국 시간). 서버 함수와 같은 기준이다.
export const seoulDay = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

// 셌으면 true. 이미 셌거나, 서버가 없거나, 기기 저장을 못 쓰면 false.
export async function countVisit(now = new Date()): Promise<boolean> {
  const today = seoulDay(now)
  const server = getServer()
  if (!server) return false
  try {
    if (window.localStorage.getItem(VISIT_KEY) === today) return false
    // 부르기 전에 적어 둔다. 탭을 여러 개 열어도, 서버에 함수가 아직 없어도 하루에 한 번만 부른다.
    window.localStorage.setItem(VISIT_KEY, today)
  } catch {
    // 기기 저장을 막아 둔 브라우저는 열 때마다 다시 세게 되므로 아예 세지 않는다.
    return false
  }
  try {
    const { error } = await (await server).rpc('count_visit')
    return !error
  } catch {
    return false
  }
}
