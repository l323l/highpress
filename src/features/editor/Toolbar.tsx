import { useEditorState, type Editor } from '@tiptap/react'
import { useRef, type CSSProperties } from 'react'
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ImageIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextAUnderlineIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  XIcon,
} from '../../components/icons'
import { IMAGE_MIME_TYPES } from './imageFiles'
import { LinkControl } from './LinkControl'
import { TableControls } from './TableControls'
import { ToolButton } from './ToolButton'
import {
  ALIGNMENTS,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_TEXT_COLOR,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  TEXT_COLORS,
  toColorInputValue,
} from '@highpress/core/body'

interface Props {
  editor: Editor
  onInsertImages: (files: File[]) => void
  spellOpen: boolean
  onToggleSpell: () => void
}

const ICON = { size: 18, 'aria-hidden': true } as const

const ALIGN_ICON = {
  left: TextAlignLeftIcon,
  center: TextAlignCenterIcon,
  right: TextAlignRightIcon,
  justify: TextAlignJustifyIcon,
} as const

export function Toolbar({ editor, onInsertImages, spellOpen, onToggleSpell }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes('textStyle')
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        align: ALIGNMENTS.find((a) => a.value !== 'left' && e.isActive({ textAlign: a.value }))?.value ?? 'left',
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        blockquote: e.isActive('blockquote'),
        link: e.isActive('link'),
        linkHref: (e.getAttributes('link').href as string | undefined) ?? '',
        table: e.isActive('table'),
        fontFamily: (style.fontFamily as string | undefined) ?? '',
        fontSize: (style.fontSize as string | undefined) ?? '',
        lineHeight: ((e.getAttributes('paragraph').lineHeight ?? e.getAttributes('heading').lineHeight) as string | null) ?? '',
        color: style.color as string | undefined,
        backgroundColor: style.backgroundColor as string | undefined,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })
  const run = () => editor.chain().focus()

  const pickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) onInsertImages(files)
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="서식">
      <div className="tool-group" role="group" aria-label="실행 취소">
        <ToolButton label="실행 취소" disabled={!state.canUndo} onClick={() => run().undo().run()}>
          <ArrowCounterClockwiseIcon {...ICON} />
        </ToolButton>
        <ToolButton label="다시 실행" disabled={!state.canRedo} onClick={() => run().redo().run()}>
          <ArrowClockwiseIcon {...ICON} />
        </ToolButton>
      </div>

      <div className="tool-group" role="group" aria-label="글꼴">
        <select
          className="tool-select"
          aria-label="글꼴"
          value={state.fontFamily}
          onChange={(e) => (e.target.value ? run().setFontFamily(e.target.value).run() : run().unsetFontFamily().run())}
        >
          <option value="">기본</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="tool-select"
          aria-label="글자 크기"
          value={state.fontSize}
          onChange={(e) => (e.target.value ? run().setFontSize(e.target.value).run() : run().unsetFontSize().run())}
        >
          <option value="">크기</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size.replace('px', '')}
            </option>
          ))}
        </select>
      </div>

      <div className="tool-group" role="group" aria-label="글자 모양">
        <ToolButton label="굵게" active={state.bold} onClick={() => run().toggleBold().run()}>
          <TextBIcon {...ICON} />
        </ToolButton>
        <ToolButton label="기울임" active={state.italic} onClick={() => run().toggleItalic().run()}>
          <TextItalicIcon {...ICON} />
        </ToolButton>
        <ToolButton label="밑줄" active={state.underline} onClick={() => run().toggleUnderline().run()}>
          <TextUnderlineIcon {...ICON} />
        </ToolButton>
        <ToolButton label="취소선" active={state.strike} onClick={() => run().toggleStrike().run()}>
          <TextStrikethroughIcon {...ICON} />
        </ToolButton>
      </div>

      <div className="tool-group" role="group" aria-label="글자색 프리셋">
        {TEXT_COLORS.map((preset) => {
          const active = preset.value === null ? !state.color : state.color?.toLowerCase() === preset.value
          return (
            <button
              key={preset.label}
              type="button"
              className="tool-swatch"
              aria-label={`글자색 ${preset.label}`}
              title={`글자색 ${preset.label}`}
              aria-pressed={active}
              style={{ '--swatch': preset.swatch } as CSSProperties}
              // 버튼을 눌러도 본문의 선택 영역이 풀리지 않게 한다.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (preset.value ? run().setColor(preset.value).run() : run().unsetColor().run())}
            />
          )
        })}
      </div>

      <div className="tool-group" role="group" aria-label="색">
        <label className="tool-color">
          글자색
          <input
            type="color"
            aria-label="글자색"
            value={toColorInputValue(state.color, DEFAULT_TEXT_COLOR)}
            onChange={(e) => editor.chain().setColor(e.target.value).run()}
          />
        </label>
        <ToolButton label="글자색 지우기" disabled={!state.color} onClick={() => run().unsetColor().run()}>
          <XIcon size={14} aria-hidden />
        </ToolButton>
        <label className="tool-color">
          배경색
          <input
            type="color"
            aria-label="배경색"
            value={toColorInputValue(state.backgroundColor, DEFAULT_HIGHLIGHT_COLOR)}
            onChange={(e) => editor.chain().setBackgroundColor(e.target.value).run()}
          />
        </label>
        <ToolButton label="배경색 지우기" disabled={!state.backgroundColor} onClick={() => run().unsetBackgroundColor().run()}>
          <XIcon size={14} aria-hidden />
        </ToolButton>
      </div>

      <div className="tool-group" role="group" aria-label="문단">
        {ALIGNMENTS.map((a) => {
          const AlignIcon = ALIGN_ICON[a.value]
          return (
            <ToolButton key={a.value} label={a.label} active={state.align === a.value} onClick={() => run().setTextAlign(a.value).run()}>
              <AlignIcon {...ICON} />
            </ToolButton>
          )
        })}
        <select
          className="tool-select"
          aria-label="줄간격"
          value={state.lineHeight}
          onChange={(e) => (e.target.value ? run().setBlockLineHeight(e.target.value).run() : run().unsetBlockLineHeight().run())}
        >
          <option value="">줄간격</option>
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>
              {lh}
            </option>
          ))}
        </select>
      </div>

      <div className="tool-group" role="group" aria-label="블록">
        <ToolButton label="글머리 기호 목록" active={state.bulletList} onClick={() => run().toggleBulletList().run()}>
          <ListBulletsIcon {...ICON} />
        </ToolButton>
        <ToolButton label="번호 목록" active={state.orderedList} onClick={() => run().toggleOrderedList().run()}>
          <ListNumbersIcon {...ICON} />
        </ToolButton>
        <ToolButton label="인용구" active={state.blockquote} onClick={() => run().toggleBlockquote().run()}>
          <QuotesIcon {...ICON} />
        </ToolButton>
        <ToolButton label="구분선" onClick={() => run().setHorizontalRule().run()}>
          <MinusIcon {...ICON} />
        </ToolButton>
      </div>

      <TableControls editor={editor} inTable={state.table} />

      <div className="tool-group" role="group" aria-label="삽입">
        <ToolButton label="이미지 넣기" onClick={() => fileInput.current?.click()}>
          <ImageIcon {...ICON} />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="이미지 파일 선택"
          onChange={pickImages}
        />
        <LinkControl editor={editor} active={state.link} href={state.linkHref} />
      </div>

      <div className="tool-group" role="group" aria-label="검사">
        <ToolButton label="맞춤법 검사" active={spellOpen} onClick={onToggleSpell}>
          <TextAUnderlineIcon {...ICON} />
        </ToolButton>
      </div>
    </div>
  )
}
