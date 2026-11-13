// core 가 쓰는 전역 가운데 웹(브라우저)과 앱(React Native · Hermes)에 모두 있는 것만 적는다.
// 여기에 없는 전역(window · document · indexedDB · crypto · Canvas 등)을 core 에서 쓰면 tsc -b 가 막는다.
// 이 파일은 core 를 따로 검사할 때(packages/core/tsconfig.json)만 쓴다. 웹 · 앱은 각자의 타입(DOM, React Native)에 같은 이름이 있다.

declare function setTimeout(handler: (...args: never[]) => void, timeout?: number): number
declare function clearTimeout(id: number | undefined): void

// 주소 검사(body/urls)가 읽는 칸만.
declare class URL {
  constructor(url: string, base?: string)
  readonly protocol: string
  readonly hostname: string
  readonly username: string
  readonly password: string
  readonly pathname: string
}

// 크기 재기(new Blob([...]).size)와 서버에 올리고 받는 사진 파일.
declare class Blob {
  constructor(parts?: (string | ArrayBuffer | ArrayBufferView | Blob)[], options?: { type?: string })
  readonly size: number
  readonly type: string
}
