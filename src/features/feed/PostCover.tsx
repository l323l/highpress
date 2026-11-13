import { useEffect, useRef, useState } from 'react'
import { loadCover } from './cover'

// 글 카드의 대표 사진. 주소로 바로 열 수 없는 보관함에 있어서, 화면에 가까워지면 받아 와 보여 준다.
export function PostCover({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void loadCover(path).then((loaded) => {
        if (cancelled) return
        if (loaded) setUrl(loaded)
        else setFailed(true)
      })
    }
    const node = box.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      load()
      return () => {
        cancelled = true
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        load()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [path])

  // 받지 못한 사진은 빈 자리를 남기지 않는다.
  if (failed) return null
  return (
    <div ref={box} className="post-cover" data-loaded={url ? true : undefined}>
      {url && <img src={url} alt={`${title} 대표 사진`} />}
    </div>
  )
}
