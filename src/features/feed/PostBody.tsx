import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { createExtensions } from '../editor/extensions'
import { feedBody } from '@highpress/core/feed'
import { getFeedRemote } from './remote'

const ignore = () => undefined

// 읽기 전용 본문. 글쓰기 화면과 같은 확장을 써서 서식과 스탯 도표가 같은 모양으로 보인다.
function PostView({ body }: { body: JSONContent }) {
  const editor = useEditor({
    extensions: createExtensions({ resolveSrc: () => null, onDropFiles: ignore, onPasteFiles: ignore }),
    content: body,
    editable: false,
    editorProps: { attributes: { class: 'prose post-prose' } },
  })
  return <EditorContent editor={editor} className="post-body" />
}

// 글을 펼칠 때만 불러온다 (에디터 코드가 홈 화면 첫 로딩에 실리지 않게 한다).
export default function PostBody({ postId }: { postId: string }) {
  // undefined: 불러오는 중, null: 읽지 못함
  const [body, setBody] = useState<JSONContent | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getFeedRemote()
      .then((remote) => (remote ? remote.body(postId) : null))
      .then((loaded) => (loaded ? feedBody(loaded) : null))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setBody(result)
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  if (body === undefined) {
    return (
      <p className="muted post-status" role="status">
        글을 불러오는 중…
      </p>
    )
  }
  if (body === null) {
    return (
      <p className="post-status post-status--error" role="alert">
        글을 불러오지 못했습니다. 잠시 뒤 다시 펼쳐 주세요.
      </p>
    )
  }
  return <PostView body={body} />
}
