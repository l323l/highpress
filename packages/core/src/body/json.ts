// 본문(TipTap JSON) 한 조각. core는 TipTap에 기대지 않으므로 같은 모양을 여기 둔다.
// @tiptap/core 의 JSONContent 와 모양이 같아 웹 에디터의 값을 그대로 주고받을 수 있다.
export type JSONContent = {
  type?: string
  attrs?: Record<string, any> | undefined
  content?: JSONContent[]
  marks?: {
    type: string
    attrs?: Record<string, any>
    [key: string]: any
  }[]
  text?: string
  [key: string]: any
}
