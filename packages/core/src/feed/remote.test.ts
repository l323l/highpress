import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { publishErrorText } from './publishError'
import { createFeedRemote, FEED_SAFETY_TEXT, FeedError, feedSafetyText } from './remote'

// 표에 쓰는 요청이 이 오류로 끝나는 가짜 서버
const failing = (error: { message: string; code?: string }) =>
  ({
    from: () => ({ insert: async () => ({ error }), update: () => ({ eq: async () => ({ error }) }) }),
  }) as unknown as SupabaseClient

const codeOf = async (work: Promise<unknown>) => {
  const caught = await work.then(
    () => null,
    (cause: unknown) => cause,
  )
  return caught instanceof FeedError ? caught.code : caught
}

describe('커뮤니티 안전 오류 (0014_moderation.sql)', () => {
  it('금칙어 · 정지 · 차단 오류를 각자의 코드로 바꾼다', async () => {
    // 서버가 어떤 SQLSTATE 를 쓰든 메시지로 가린다 (check 위반 23514 · 권한 42501 보다 먼저).
    expect(await codeOf(createFeedRemote(failing({ message: 'banned_word', code: '23514' })).addComment('p1', '본문'))).toBe('banned')
    expect(await codeOf(createFeedRemote(failing({ message: 'suspended', code: '42501' })).addComment('p1', '본문'))).toBe('suspended')
    expect(await codeOf(createFeedRemote(failing({ message: 'blocked', code: 'P0001' })).follow('u2'))).toBe('blocked')
    expect(await codeOf(createFeedRemote(failing({ message: 'banned_word', code: 'P0001' })).saveProfile('u1', { bio: '소개', club: null }))).toBe('banned')
  })

  it('예전 오류는 그대로 가린다', async () => {
    expect(await codeOf(createFeedRemote(failing({ message: 'comment_quota', code: 'P0001' })).addComment('p1', '본문'))).toBe('quota')
    expect(await codeOf(createFeedRemote(failing({ message: 'new row violates row-level security policy', code: '42501' })).addComment('p1', '본문'))).toBe('denied')
    expect(await codeOf(createFeedRemote(failing({ message: 'check', code: '23514' })).addComment('p1', '본문'))).toBe('quota')
  })

  it('화면 문구: 안전 오류면 정해 둔 문구, 아니면 null', () => {
    expect(feedSafetyText(new FeedError('banned'))).toBe(FEED_SAFETY_TEXT.banned)
    expect(feedSafetyText(new FeedError('suspended'))).toContain('이용이 정지된 계정')
    expect(feedSafetyText(new FeedError('blocked'))).toContain('차단')
    expect(feedSafetyText(new FeedError('quota'))).toBeNull()
    expect(feedSafetyText(new Error('banned'))).toBeNull()
  })

  it('피드에 올리다 걸리면 글이 기기에 남아 있다고 함께 알린다', () => {
    expect(publishErrorText(new FeedError('banned'))).toContain('쓸 수 없는 말')
    expect(publishErrorText(new FeedError('banned'))).toContain('이 기기에 그대로')
    expect(publishErrorText(new FeedError('suspended'))).toBe(FEED_SAFETY_TEXT.suspended)
  })
})
