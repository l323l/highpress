// 새 id를 만드는 함수. 웹은 crypto.randomUUID, 앱은 expo-crypto를 넘긴다.
export type NewId = () => string

// 밖에서 들어온 값(백업 파일, 드래그 payload, 본문 속성)이 id로 쓸 수 있는 꼴인지 확인한다.
export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value)
}
