import type { Point, TacticProject } from '../db/types'
import { frameTimes, positionsAt, sceneIndexAt } from './animation'
import { STAGE_H, STAGE_W } from './geometry'

// GIF 한 장 한 장의 위치 · 표시 시간. 인코딩(웹 gifenc, 앱 네이티브)은 각자 한다.
export const GIF_WIDTH = 960
export const GIF_HEIGHT = Math.round((GIF_WIDTH * STAGE_H) / STAGE_W / 2) * 2
export const GIF_FPS = 20

export interface GifFrame {
  positions: Record<string, Point>
  // 이 프레임에 그릴 도형이 속한 장면
  sceneIndex: number
  delayMs: number
}

// 멈춤 구간은 같은 위치가 이어지므로 한 프레임으로 합치고 표시 시간만 늘린다.
export function gifFrames(project: TacticProject, fps = GIF_FPS): GifFrame[] {
  const frames: GifFrame[] = []
  for (const time of frameTimes(project, fps)) {
    const positions = positionsAt(project, time)
    const last = frames.at(-1)
    if (last && last.positions === positions) last.delayMs += 1000 / fps
    else frames.push({ positions, sceneIndex: sceneIndexAt(project, time), delayMs: 1000 / fps })
  }
  return frames
}
