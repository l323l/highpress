import { excerptOf, FEED_LIMITS, FeedError, feedBody, PublishError } from '@highpress/core/feed'
import { db } from '../../db/db'
import { getMediaBlob } from '../../db/store'
import { clubOf } from '../../lib/clubs'
import { clearCovers, makeCover } from './cover'
import { getFeedRemote } from './remote'

// 본문 다듬기(feedBody · excerptOf)와 오류 문구(publishErrorText)는 @highpress/core/feed 에 있다.

// 기기에 저장된 칼럼을 피드에 올린다. 같은 칼럼을 다시 올리면 피드의 글이 바뀐다.
// coverMediaId: 대표 사진으로 쓸 본문 사진. 없으면 사진 없이 올린다. shrink: 사진을 올릴 크기로 줄이는 함수.
export async function publishColumn(
  columnId: string,
  club: string | null = null,
  coverMediaId: string | null = null,
  shrink: (source: Blob) => Promise<Blob> = makeCover,
): Promise<void> {
  const column = await db.columns.get(columnId)
  if (!column) throw new PublishError('missing')
  const title = column.title.trim()
  if (!title) throw new PublishError('no-title')
  const body = feedBody(column.body)
  if (new Blob([JSON.stringify(body)]).size > FEED_LIMITS.bodyBytes) throw new PublishError('too-big')
  let cover: Blob | null = null
  if (coverMediaId) {
    const media = await db.media.get(coverMediaId)
    const source = media && media.columnId === columnId && media.kind !== 'video' ? await getMediaBlob(coverMediaId).catch(() => null) : null
    if (!source) throw new PublishError('bad-cover')
    try {
      cover = await shrink(source)
    } catch {
      throw new PublishError('bad-cover')
    }
  }
  const remote = await getFeedRemote()
  if (!remote) throw new FeedError('failed')
  try {
    await remote.publish({ columnId, title, excerpt: excerptOf(body).slice(0, FEED_LIMITS.excerpt), body, club: clubOf(club)?.id ?? null, cover })
  } finally {
    // 같은 위치의 사진이 바뀌었을 수 있다. 받아 둔 것을 버린다.
    clearCovers()
  }
}
