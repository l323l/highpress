import { createFeedRemote, type FeedRemote } from '@highpress/core/feed'
import { getServer } from '../../lib/supabase'

// 피드 서버 함수의 모양과 오류 처리는 @highpress/core/feed 에 있다. 여기서는 웹의 서버 클라이언트를 넣어 준다.

// 서버 설정이 없으면 null.
export async function getFeedRemote(): Promise<FeedRemote | null> {
  const server = await getServer()
  return server ? createFeedRemote(server) : null
}
