import type { ColumnStatus } from '../db/types'
import { isHttpUrl } from './urls'

// 기기에 기록할 게시 링크. 올바른 웹 주소가 아니면 비운다.
export function storedPublishedUrl(input: string): string {
  return isHttpUrl(input) ? input.trim() : ''
}

// `저장` 버튼: 게시 링크가 있으면 게시됨, 없으면 저장됨.
export function statusOnSave(publishedUrl: string): ColumnStatus {
  return isHttpUrl(publishedUrl) ? 'published' : 'saved'
}

// 자동 저장·임시저장: 임시 글은 임시로 남는다. 이미 저장한 글은 게시 링크 유무만 따라간다 (H-6).
export function statusOnAutosave(current: ColumnStatus, publishedUrl: string): ColumnStatus {
  return current === 'draft' ? 'draft' : statusOnSave(publishedUrl)
}
