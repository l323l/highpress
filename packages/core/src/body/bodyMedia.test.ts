import type { JSONContent } from './json'
import { describe, expect, it } from 'vitest'
import { collectMediaIds, hydrateMediaSrc, stripMediaSrc } from './bodyMedia'

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '본문' }] },
    { type: 'image', attrs: { mediaId: 'm1', src: 'blob:abc', alt: 'a' } },
    { type: 'blockquote', content: [{ type: 'image', attrs: { mediaId: 'm2', src: 'blob:def' } }] },
    { type: 'image', attrs: { src: 'https://example.com/x.png' } },
  ],
}

describe('bodyMedia', () => {
  it('collectMediaIds는 중첩된 mediaId만 모은다', () => {
    expect(collectMediaIds(doc)).toEqual(['m1', 'm2'])
  })

  it('stripMediaSrc는 mediaId가 있는 이미지의 src만 비우고 원본은 바꾸지 않는다', () => {
    const stripped = stripMediaSrc(doc)
    expect(stripped.content![1].attrs).toEqual({ mediaId: 'm1', src: null, alt: 'a' })
    expect(stripped.content![2].content![0].attrs!.src).toBeNull()
    expect(stripped.content![3].attrs!.src).toBe('https://example.com/x.png')
    expect(doc.content![1].attrs!.src).toBe('blob:abc')
  })

  it('hydrateMediaSrc는 같은 id를 한 번만 조회하고 없는 파일은 null로 둔다', async () => {
    const calls: string[] = []
    const twice: JSONContent = { type: 'doc', content: [doc.content![1], doc.content![1], doc.content![2]] }
    const hydrated = await hydrateMediaSrc(stripMediaSrc(twice), async (id) => {
      calls.push(id)
      return id === 'm1' ? 'blob:new' : null
    })
    expect(calls).toEqual(['m1', 'm2'])
    expect(hydrated.content![0].attrs!.src).toBe('blob:new')
    expect(hydrated.content![1].attrs!.src).toBe('blob:new')
    expect(hydrated.content![2].content![0].attrs!.src).toBeNull()
  })
})
