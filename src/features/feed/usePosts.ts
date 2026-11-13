import { useEffect, useRef, useState } from 'react'
import { FEED_LIMITS, FeedError, type FeedPost, type PageOptions } from '@highpress/core/feed'
import { getFeedRemote } from './remote'

type Filter = Pick<PageOptions, 'author' | 'club' | 'clubs' | 'following' | 'query' | 'sort'>

function loadErrorText(cause: unknown): string {
  if (cause instanceof FeedError && cause.code === 'outdated') return '검색, 구단·팔로잉으로 거르기, 좋아요순은 서버 설정(0004_social.sql, 0005_search.sql, 0007_sort.sql)을 마친 뒤 쓸 수 있습니다.'
  return '피드를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.'
}

// 피드 한 줄(홈 피드, 프로필의 글 목록)이 함께 쓰는 불러오기·좋아요·내리기.
// reloads 값이 바뀌거나 거르는 조건이 바뀌면 첫 쪽부터 다시 읽는다.
export function usePosts({ author = null, club = null, clubs = null, following = false, query = '', sort = 'new' }: Filter, reloads = 0) {
  // 배열은 그릴 때마다 새로 만들어지므로, 내용이 바뀌었는지는 이어 붙인 글자로 본다.
  const clubsKey = clubs?.join(',') ?? ''
  // null: 불러오는 중
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  // 읽을 권한이 없다고 서버가 답했다 (로그인하지 않았고 서버가 아직 읽기를 열지 않았다).
  const [denied, setDenied] = useState(false)
  // 늦게 도착한 이전 요청이 화면을 덮어쓰지 않게 한다.
  const request = useRef(0)

  // 다음 쪽: 최신순은 마지막 글의 시각(before)부터, 좋아요순은 이미 읽은 글 수(offset)만큼 건너뛰고 읽는다.
  const load = async (next?: { before?: number; offset?: number }) => {
    const current = ++request.current
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      const page = await remote.page({ before: next?.before, ...(sort === 'top' ? { offset: next?.offset ?? 0 } : {}), author, club, clubs, following, query, sort })
      if (current !== request.current) return
      // 그 사이 좋아요 수가 바뀌어 같은 글이 다시 올 수 있다. 이미 있는 글은 넣지 않는다.
      setPosts((previous) => (next && previous ? [...previous, ...page.filter((post) => !previous.some((item) => item.id === post.id))] : page))
      setMore(page.length === FEED_LIMITS.page)
      setError('')
      setDenied(false)
    } catch (cause) {
      if (current !== request.current) return
      setPosts((previous) => (next ? (previous ?? []) : []))
      setMore(false)
      setError(loadErrorText(cause))
      setDenied(cause instanceof FeedError && cause.code === 'denied')
    }
  }

  useEffect(() => {
    setPosts(null)
    void load()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [author, club, clubsKey, following, query, sort, reloads])

  const patch = (postId: string, change: (post: FeedPost) => FeedPost) => setPosts((previous) => previous?.map((post) => (post.id === postId ? change(post) : post)) ?? previous)

  const like = async (post: FeedPost) => {
    const liked = !post.liked
    // 먼저 화면을 바꾸고, 서버가 거절하면 되돌린다.
    patch(post.id, (current) => ({ ...current, liked, likeCount: Math.max(0, current.likeCount + (liked ? 1 : -1)) }))
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await (liked ? remote.like(post.id) : remote.unlike(post.id))
    } catch {
      patch(post.id, (current) => ({ ...current, liked: post.liked, likeCount: post.likeCount }))
      setError('좋아요를 반영하지 못했습니다. 잠시 뒤 다시 눌러 주세요.')
    }
  }

  const remove = async (post: FeedPost) => {
    if (!window.confirm(`"${post.title}" 글을 피드에서 내릴까요? 좋아요와 댓글도 함께 지워집니다. 이 기기의 칼럼은 그대로 남습니다.`)) return
    try {
      const remote = await getFeedRemote()
      if (!remote) throw new FeedError('failed')
      await remote.unpublish(post.id)
      setPosts((previous) => previous?.filter((item) => item.id !== post.id) ?? previous)
    } catch {
      setError('글을 내리지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    }
  }

  return {
    posts,
    more,
    error,
    denied,
    loadMore: () => (posts && posts.length > 0 ? load(sort === 'top' ? { offset: posts.length } : { before: posts[posts.length - 1].createdAt }) : Promise.resolve()),
    like,
    remove,
  }
}
