import type { AnyExtension, Editor, Extensions } from '@tiptap/core'
import { FileHandler } from '@tiptap/extension-file-handler'
import { TableKit } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { StarterKit } from '@tiptap/starter-kit'
import { hasAllowedScheme } from '@highpress/core/body'
import { BlockLineHeight } from './blockLineHeight'
import { MediaImage } from './mediaImage'
import { StatBlock } from './statBlock'

export interface FileHandlers {
  onDropFiles: (editor: Editor, files: File[], pos: number) => void
  onPasteFiles: (editor: Editor, files: File[], html: string | undefined) => void
}

export interface EditorExtensionOptions extends Partial<FileHandlers> {
  resolveSrc: (mediaId: string) => string | null
  // 스탯 블록을 화면용 노드 뷰가 붙은 것으로 바꿔 끼울 때. 이름(statBlock)과 스키마는 같아야 한다.
  statBlock?: AnyExtension
}

// 웹 에디터 · 앱 웹뷰 에디터 · 피드 글 보기가 함께 쓰는 확장 목록. 스키마가 같아야 본문 JSON을 주고받을 수 있다.
// 파일 끌어놓기 · 붙여넣기 핸들러가 둘 다 있을 때만 FileHandler를 넣는다 (앱은 사진을 네이티브로 넣는다).
export function createExtensions(options: EditorExtensionOptions): Extensions {
  const { resolveSrc, onDropFiles, onPasteFiles, statBlock = StatBlock } = options
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        defaultProtocol: 'https',
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && hasAllowedScheme(url),
      },
    }),
    TextStyleKit.configure({ lineHeight: false }),
    BlockLineHeight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit,
    MediaImage.configure({ resize: { enabled: true, minWidth: 48, minHeight: 48, alwaysPreserveAspectRatio: true }, resolveSrc }),
    statBlock,
    // 형식·크기 검사는 안내 메시지를 보여 주기 위해 핸들러에서 직접 한다.
    ...(onDropFiles && onPasteFiles ? [FileHandler.configure({ onDrop: onDropFiles, onPaste: onPasteFiles })] : []),
  ]
}
