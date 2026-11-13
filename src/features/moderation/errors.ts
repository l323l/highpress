import { getModerationRemote, MODERATION_ERROR_TEXT, ModerationError, type ModerationRemote } from './api'

// 어떤 오류든 화면에 보일 문구로 바꾼다. 모르는 오류는 "처리하지 못했습니다".
export function moderationErrorText(cause: unknown): string {
  return MODERATION_ERROR_TEXT[cause instanceof ModerationError ? cause.code : 'failed']
}

// 서버 설정이 없으면 실패로 본다.
export async function requireModeration(): Promise<ModerationRemote> {
  const remote = await getModerationRemote()
  if (!remote) throw new ModerationError('failed')
  return remote
}
