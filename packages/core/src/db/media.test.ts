import { describe, expect, it } from 'vitest'
import { mediaPath } from './types'

describe('mediaPath', () => {
  it('형식에 맞는 확장자를 붙인 상대 경로를 만든다', () => {
    expect(mediaPath('abc-1', 'image/jpeg')).toBe('media/abc-1.jpg')
    expect(mediaPath('abc-1', 'video/mp4')).toBe('media/abc-1.mp4')
  })

  it('모르는 형식이나 경로를 벗어날 수 있는 id는 받지 않는다', () => {
    expect(mediaPath('abc', 'image/svg+xml')).toBeNull()
    expect(mediaPath('abc', 'toString')).toBeNull()
    expect(mediaPath('../x', 'image/png')).toBeNull()
    expect(mediaPath('a/b', 'image/png')).toBeNull()
  })
})
