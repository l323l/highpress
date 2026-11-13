import type { TacticProject } from '@highpress/core/db'
import type { TacticFormat } from '@highpress/core/body'
import { drawFrame, clamp, STAGE_H, STAGE_W } from '@highpress/core/tactics'
import { createCanvas } from './canvas'
import { encodeGif } from './gif'
import { encodeMp4 } from './mp4'

export interface RenderOptions {
  // png에서만 쓰인다. 기본은 첫 장면.
  sceneIndex?: number
  onProgress?: (ratio: number) => void
}

function renderPng(project: TacticProject, sceneIndex: number): Promise<Blob> {
  const scene = project.scenes[clamp(sceneIndex, 0, project.scenes.length - 1)]
  const { canvas, ctx } = createCanvas(STAGE_W, STAGE_H)
  drawFrame(ctx, project, scene?.positions ?? {}, STAGE_W, scene?.shapes)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 이미지를 만들지 못했습니다'))),
      'image/png',
    )
  })
}

export function renderTactic(project: TacticProject, format: TacticFormat, opts: RenderOptions = {}): Promise<Blob> {
  if (format === 'png') return renderPng(project, opts.sceneIndex ?? 0)
  if (format === 'gif') return encodeGif(project, opts.onProgress)
  return encodeMp4(project, opts.onProgress)
}
