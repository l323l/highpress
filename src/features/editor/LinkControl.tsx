import type { Editor } from '@tiptap/react'
import { useState } from 'react'
import { ToolButton } from './ToolButton'
import { normalizeLinkUrl } from '@highpress/core/body'

interface Props {
  editor: Editor
  active: boolean
  href: string
}

export function LinkControl({ editor, active, href }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const toggle = () => {
    setValue(href)
    setError(false)
    setOpen((v) => !v)
  }

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    const url = normalizeLinkUrl(value)
    if (!url) return setError(true)
    const chain = editor.chain().focus()
    if (editor.state.selection.empty && !active) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    } else {
      chain.extendMarkRange('link').setLink({ href: url }).run()
    }
    setOpen(false)
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setOpen(false)
  }

  return (
    <>
      <ToolButton label="링크" active={active || open} onClick={toggle}>
        링크
      </ToolButton>
      {open && (
        <form className="tool-link" onSubmit={apply}>
          <label className="sr-only" htmlFor="tool-link-url">
            링크 주소
          </label>
          <input
            id="tool-link-url"
            className="field"
            placeholder="https://"
            value={value}
            autoFocus
            aria-invalid={error}
            onChange={(e) => {
              setValue(e.target.value)
              setError(false)
            }}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <button type="submit" className="btn">
            적용
          </button>
          {active && (
            <button type="button" className="btn" onClick={remove}>
              링크 제거
            </button>
          )}
          {error && (
            <span className="tool-error" role="alert">
              http, https, mailto 주소만 넣을 수 있습니다.
            </span>
          )}
        </form>
      )}
    </>
  )
}
