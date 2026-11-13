export interface ExportCanvas {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

export function createCanvas(width: number, height: number, willReadFrequently = false): ExportCanvas {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently })
  if (!ctx) throw new Error('이 브라우저에서는 캔버스를 사용할 수 없습니다')
  return { canvas, ctx }
}

// 인코딩이 길어져도 화면이 멈추지 않게 한 박자 쉰다.
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
