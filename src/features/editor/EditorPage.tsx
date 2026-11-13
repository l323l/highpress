import type { JSONContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import type { Column } from '@highpress/core/db'
import { toHash } from '../../lib/router'
import { loadBody } from './bodyLoad'
import { EditorWorkspace } from './EditorWorkspace'
import { createMediaUrls, type MediaUrls } from './mediaUrls'
import './editor.css'

interface Loaded {
  column: Column
  body: JSONContent
  urls: MediaUrls
}

export function EditorPage({ columnId }: { columnId: string }) {
  // undefined: 불러오는 중, null: 칼럼 없음
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined)

  useEffect(() => {
    const urls = createMediaUrls()
    let cancelled = false
    const load = async () => {
      const column = await db.columns.get(columnId)
      if (!column) return null
      return { column, body: await loadBody(column, urls), urls }
    }
    load()
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setLoaded(result)
      })
    return () => {
      cancelled = true
      urls.dispose()
    }
  }, [columnId])

  if (loaded === undefined) {
    return (
      <main className="editor-message" role="status">
        <p className="muted">칼럼을 불러오는 중…</p>
      </main>
    )
  }
  if (loaded === null) {
    return (
      <main className="editor-message">
        <p>칼럼을 찾을 수 없습니다.</p>
        <a className="btn" href={toHash({ name: 'home' })}>
          홈으로 돌아가기
        </a>
      </main>
    )
  }
  return <EditorWorkspace column={loaded.column} initialBody={loaded.body} urls={loaded.urls} />
}
