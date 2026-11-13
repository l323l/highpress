import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { TacticProject } from '@highpress/core/db'
import { drawFrame, GIF_HEIGHT, GIF_WIDTH, gifFrames } from '@highpress/core/tactics'
import { createCanvas, nextTick } from './canvas'

// 장면을 GIF 프레임으로 나누는 계산(gifFrames · GIF_*)은 @highpress/core/tactics 에 있다.

export async function encodeGif(project: TacticProject, onProgress?: (ratio: number) => void): Promise<Blob> {
  const { ctx } = createCanvas(GIF_WIDTH, GIF_HEIGHT, true)
  const frames = gifFrames(project)
  const gif = GIFEncoder()
  // 색은 전부 단색이고 장면마다 도형 색만 달라지므로, 팔레트는 장면마다 한 번만 만든다.
  const palettes = new Map<number, number[][]>()
  for (let i = 0; i < frames.length; i++) {
    const { positions, sceneIndex, delayMs } = frames[i]
    drawFrame(ctx, project, positions, GIF_WIDTH, project.scenes[sceneIndex]?.shapes)
    const { data } = ctx.getImageData(0, 0, GIF_WIDTH, GIF_HEIGHT)
    let palette = palettes.get(sceneIndex)
    if (!palette) {
      palette = quantize(data, 256)
      palettes.set(sceneIndex, palette)
    }
    gif.writeFrame(applyPalette(data, palette), GIF_WIDTH, GIF_HEIGHT, { palette, delay: delayMs, repeat: 0 })
    onProgress?.((i + 1) / frames.length)
    await nextTick()
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}
