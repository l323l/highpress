import type { Plan, Size } from '@highpress/core/photo'

// 바탕 사진을 캔버스에 그리고 파일을 읽는 부분(브라우저 전용). 배치 계산(plan*)은 @highpress/core/photo 에 있다.

export interface Source {
  name: string
  image: CanvasImageSource
  size: Size
}

// 바탕 그리기. 칸 사이는 gapColor 로 채운다.
export function paintBase(canvas: HTMLCanvasElement, plan: Plan, sources: Source[], gapColor: string): void {
  canvas.width = plan.width
  canvas.height = plan.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = gapColor
  ctx.fillRect(0, 0, plan.width, plan.height)
  ctx.imageSmoothingQuality = 'high'
  plan.cells.forEach((cell, index) => {
    const source = sources[index]
    if (source) ctx.drawImage(source.image, cell.x, cell.y, cell.w, cell.h)
  })
}

export async function loadSource(file: File): Promise<Source> {
  // 휴대폰 사진의 회전 정보를 따른다.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return { name: file.name, image: bitmap, size: { width: bitmap.width, height: bitmap.height } }
}
