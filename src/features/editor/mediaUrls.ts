// 이 화면에서 만든 blob: URL을 모아 두었다가 화면을 떠날 때 한꺼번에 해제한다.
export interface MediaUrls {
  create(mediaId: string, blob: Blob): string | null
  get(mediaId: string): string | null
  dispose(): void
}

export function createMediaUrls(): MediaUrls {
  const urls = new Map<string, string>()
  let disposed = false
  return {
    create(mediaId, blob) {
      if (disposed) return null
      const existing = urls.get(mediaId)
      if (existing) return existing
      const url = URL.createObjectURL(blob)
      urls.set(mediaId, url)
      return url
    },
    get: (mediaId) => urls.get(mediaId) ?? null,
    dispose() {
      disposed = true
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    },
  }
}
