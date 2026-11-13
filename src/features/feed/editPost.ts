import { db } from '../../db/db'
import type { Column } from '@highpress/core/db'
import { feedBody, FeedError, type FeedPost } from '@highpress/core/feed'
import { getFeedRemote } from './remote'

// 피드에 올린 글을 고치러 글쓰기 화면에 들어갔다는 표시 (이 탭에서만 남는다). 글쓰기 화면이 안내를 띄우는 데 쓴다.
export const EDITING_KEY = 'hp:editing-post'

// 피드에 올린 내 글을 글쓰기 화면에서 고칠 수 있게 준비하고, 열 칼럼의 id 를 돌려준다.
// 원본 칼럼이 이 기기에 있으면 그것을 연다. 없으면(다른 기기에서 올린 글) 피드에 올라간 글을 받아 같은 id 의 칼럼으로 만들어 둔다.
// 같은 id 로 다시 "피드에 올리기"를 누르면 새 글이 생기지 않고 그 글이 바뀐다.
export async function prepareEdit(post: FeedPost): Promise<string> {
  const existing = await db.columns.get(post.columnId)
  if (!existing) {
    const remote = await getFeedRemote()
    if (!remote) throw new FeedError('failed')
    const body = await remote.body(post.id)
    if (!body) throw new FeedError('failed')
    const now = Date.now()
    const column: Column = {
      id: post.columnId,
      title: post.title,
      // 피드에는 글과 스탯 표만 올라가 있다. 본문의 사진과 영상은 올린 기기에만 있다.
      body: feedBody(body),
      teamId: null,
      isBest: false,
      status: 'saved',
      publishedUrl: '',
      feedClub: post.club,
      serverSyncedAt: null,
      createdAt: post.createdAt || now,
      updatedAt: now,
    }
    await db.columns.put(column)
  }
  try {
    window.sessionStorage.setItem(EDITING_KEY, post.columnId)
  } catch {
    // 표시를 남기지 못해도 고치는 데는 지장이 없다.
  }
  return post.columnId
}
