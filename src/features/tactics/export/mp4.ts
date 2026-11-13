import type { TacticProject } from '@highpress/core/db'
import { frameTimes, positionsAt, sceneIndexAt, drawFrame, STAGE_H, STAGE_W } from '@highpress/core/tactics'
import { createCanvas } from './canvas'

export const MP4_FPS = 30

export async function isMp4Supported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  try {
    const { canEncode } = await import('mediabunny')
    return await canEncode('avc')
  } catch {
    return false
  }
}

export async function encodeMp4(project: TacticProject, onProgress?: (ratio: number) => void): Promise<Blob> {
  // mediabunny는 MP4를 실제로 내보낼 때만 불러온다.
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } = await import('mediabunny')
  const { canvas, ctx } = createCanvas(STAGE_W, STAGE_H)
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: MP4_FPS })
  await output.start()
  try {
    const times = frameTimes(project, MP4_FPS)
    for (let i = 0; i < times.length; i++) {
      drawFrame(ctx, project, positionsAt(project, times[i]), STAGE_W, project.scenes[sceneIndexAt(project, times[i])]?.shapes)
      await source.add(i / MP4_FPS, 1 / MP4_FPS)
      onProgress?.((i + 1) / times.length)
    }
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => undefined)
    throw error
  }
  if (!target.buffer) throw new Error('MP4 파일을 만들지 못했습니다')
  return new Blob([target.buffer], { type: 'video/mp4' })
}
