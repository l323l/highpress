import { FEED_LIMITS, FEED_SAFETY_TEXT, FeedError } from './remote'

// 피드에 올리기 전에 기기에서 걸러 낸 문제. 서버 오류는 FeedError 로 온다.
export type PublishProblem = 'no-title' | 'too-big' | 'missing' | 'bad-cover'

export class PublishError extends Error {
  readonly problem: PublishProblem

  constructor(problem: PublishProblem) {
    super(problem)
    this.problem = problem
  }
}

export function publishErrorText(error: unknown): string {
  if (error instanceof PublishError) {
    if (error.problem === 'no-title') return '제목을 적은 뒤 올려 주세요.'
    if (error.problem === 'too-big') return '글이 너무 깁니다. 피드에는 한 편에 300KB까지 올릴 수 있습니다.'
    if (error.problem === 'bad-cover') return '고른 사진을 읽지 못했습니다. 다른 사진을 고르거나 "사진 없이"로 올려 주세요.'
    return '칼럼을 찾을 수 없습니다.'
  }
  if (error instanceof FeedError) {
    if (error.code === 'banned') return '제목 · 요약 · 글에 쓸 수 없는 말이 들어 있습니다. 그 말을 고친 뒤 다시 올려 주세요. 글은 이 기기에 그대로 있습니다.'
    if (error.code === 'suspended') return FEED_SAFETY_TEXT.suspended
    if (error.code === 'quota') return `피드에는 ${FEED_LIMITS.posts}편까지 올릴 수 있습니다. 올린 글을 내린 뒤 다시 시도해 주세요.`
    if (error.code === 'full') return '서버가 한도에 닿아 지금은 새 글을 받지 않습니다. 글은 이 기기에 그대로 있습니다.'
    if (error.code === 'outdated') return '서버가 아직 구단 태그나 대표 사진을 받지 못합니다. 구단을 "없음", 사진을 "사진 없이"로 두고 올려 주세요.'
    if (error.code === 'cover') return '글은 피드에 올렸지만 대표 사진은 올리지 못했습니다. 잠시 뒤 다시 올려 보세요.'
  }
  return '피드에 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}
