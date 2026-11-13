import { NAVER_LIMITS } from './limits'

// no-title: 제목 없음, too-many: 사진이 너무 많음, too-big: 글이나 사진이 너무 큼, bad-image: 사진을 읽지 못함,
// too-fast: 글을 연달아 올림, login: 네이버 로그인이 끝났거나 카페 글쓰기에 동의하지 않음, off: 서버가 아직 준비되지 않음, failed: 그 밖의 실패
export type NaverPostProblem = 'no-title' | 'too-many' | 'too-big' | 'bad-image' | 'too-fast' | 'login' | 'off' | 'failed'

export class NaverPostError extends Error {
  readonly problem: NaverPostProblem
  // 네이버가 알려 준 이유 (있을 때만)
  readonly detail: string

  constructor(problem: NaverPostProblem, detail = '') {
    super(problem)
    this.problem = problem
    this.detail = detail
  }
}

export function naverPostErrorText(error: unknown): string {
  if (!(error instanceof NaverPostError)) return '네이버 카페에 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
  const said = error.detail ? ` (네이버: ${error.detail})` : ''
  switch (error.problem) {
    case 'no-title':
      return '제목을 적은 뒤 올려 주세요.'
    case 'too-many':
      return `사진은 한 글에 ${NAVER_LIMITS.images}장까지 함께 올릴 수 있습니다. 사진을 줄이거나 "서식 유지 복사"로 올려 주세요.`
    case 'too-big':
      return '글이나 사진이 너무 큽니다. 사진을 줄이거나 "서식 유지 복사"로 올려 주세요.'
    case 'bad-image':
      return '읽을 수 없는 사진이 있어 올리지 못했습니다.'
    case 'too-fast':
      return '네이버 카페는 글을 연달아 올릴 수 없습니다. 1~2분 뒤 다시 눌러 주세요.'
    case 'login':
      return '네이버 로그인이 끝났거나 "카페 글쓰기"에 동의하지 않았습니다. 다시 눌러 로그인해 주세요.'
    case 'off':
      return '네이버 카페에 올리는 서버가 아직 준비되지 않았습니다.'
    default:
      return `네이버 카페가 글을 받지 않았습니다${said}. 그 카페에 가입했는지, 그 게시판에 글을 쓸 수 있는지 확인해 주세요.`
  }
}
