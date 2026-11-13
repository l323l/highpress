import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from '@highpress/core/db'

export { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES }

// 문제가 없으면 null, 있으면 사용자에게 보여 줄 메시지.
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type)) return `${file.name}: PNG, JPG, GIF, WebP 이미지만 넣을 수 있습니다.`
  if (file.size > IMAGE_MAX_BYTES) return `${file.name}: 10MB보다 큰 이미지는 넣을 수 없습니다.`
  if (file.size === 0) return `${file.name}: 빈 파일입니다.`
  return null
}

export function splitImageFiles<T extends { name: string; type: string; size: number }>(
  files: T[],
): { accepted: T[]; errors: string[] } {
  const accepted: T[] = []
  const errors: string[] = []
  for (const file of files) {
    const error = validateImageFile(file)
    if (error) errors.push(error)
    else accepted.push(file)
  }
  return { accepted, errors }
}
