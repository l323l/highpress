import { BALL_ID, type Point, type Shape, type TacticProject } from '../db/types'
import {
  ARROW_HEAD,
  BALL_RADIUS,
  DEFAULT_PITCH_COLOR,
  LINE_COLOR,
  LINE_WIDTH,
  NAME_FONT_SIZE,
  PITCH_LINES,
  SHAPE_DASH,
  SHAPE_WIDTH,
  STAGE_H,
  STAGE_W,
  TOKEN_RADIUS,
  tokenRadius,
  toStage,
} from './geometry'

// 아래 그리기 함수가 쓰는 Canvas2D의 일부. core는 DOM 타입을 쓰지 않으므로 필요한 것만 적는다.
// 웹의 CanvasRenderingContext2D · OffscreenCanvasRenderingContext2D(Konva 포함)가 그대로 맞고,
// 앱은 Skia 어댑터(mobile/spikes/media/skiaCanvas2D.ts)가 같은 이름으로 흉내 낸다.
// 색 칸은 읽지 않고 넣기만 하므로, 웹이 그라디언트 같은 객체를 받는 것과도 맞게 string | object 로 둔다.
export interface FrameContext {
  fillStyle: string | object
  strokeStyle: string | object
  lineWidth: number
  lineCap: string
  lineJoin: string
  globalAlpha: number
  font: string
  textAlign: string
  textBaseline: string
  save(): void
  restore(): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void
  fill(): void
  stroke(): void
  fillRect(x: number, y: number, width: number, height: number): void
  strokeRect(x: number, y: number, width: number, height: number): void
  setLineDash(segments: number[]): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
}

const NAME_FONT = `600 ${NAME_FONT_SIZE}px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`
const OUTLINE = 'rgba(0, 0, 0, 0.75)'
const SELECTED = '#ffffff'

// 아래 그리기 함수들은 웹 화면(src/features/tactics/Board.tsx의 Konva sceneFunc) · 앱 화면(Skia)과 내보내기(PNG·GIF·MP4)가 함께 쓴다.
// 그래서 화면에 보이는 그대로 파일이 나온다. 좌표는 모두 무대 좌표.

export function drawPitch(ctx: FrameContext, pitchColor: string | undefined): void {
  ctx.fillStyle = pitchColor ?? DEFAULT_PITCH_COLOR
  ctx.fillRect(0, 0, STAGE_W, STAGE_H)

  ctx.strokeStyle = LINE_COLOR
  ctx.lineWidth = LINE_WIDTH
  for (const rect of PITCH_LINES.rects) ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  const { halfway, circle, spot } = PITCH_LINES
  ctx.beginPath()
  ctx.moveTo(halfway.from.x, halfway.from.y)
  ctx.lineTo(halfway.to.x, halfway.to.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = LINE_COLOR
  ctx.beginPath()
  ctx.arc(spot.x, spot.y, spot.radius, 0, Math.PI * 2)
  ctx.fill()
}

function ellipsePath(ctx: FrameContext, from: Point, to: Point): void {
  ctx.beginPath()
  ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2)
}

// 도형의 윤곽만 경로로 만든다. 화면에서 누를 수 있는 영역을 정할 때도 쓴다.
export function shapePath(ctx: FrameContext, shape: Shape): void {
  const from = toStage(shape.from)
  const to = toStage(shape.to)
  if (shape.kind === 'ellipse') {
    ellipsePath(ctx, from, to)
    return
  }
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
}

export function drawShape(ctx: FrameContext, shape: Shape, selected = false): void {
  const from = toStage(shape.from)
  const to = toStage(shape.to)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (selected) {
    // 고른 도형은 흰 테두리를 깔아 표시한다.
    ctx.strokeStyle = SELECTED
    ctx.lineWidth = SHAPE_WIDTH + 6
    shapePath(ctx, shape)
    ctx.stroke()
  }
  ctx.strokeStyle = shape.color
  ctx.fillStyle = shape.color
  ctx.lineWidth = SHAPE_WIDTH
  if (shape.dashed) ctx.setLineDash(SHAPE_DASH)

  if (shape.kind === 'ellipse') {
    ellipsePath(ctx, from, to)
    ctx.globalAlpha = 0.18
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
  } else if (shape.kind === 'line') {
    shapePath(ctx, shape)
    ctx.stroke()
  } else {
    // 화살촉이 선 끝을 덮도록 선은 촉 길이만큼 짧게 긋는다.
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const shaft = Math.max(0, length - ARROW_HEAD * 0.8)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(from.x + Math.cos(angle) * shaft, from.y + Math.sin(angle) * shaft)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - ARROW_HEAD * Math.cos(angle - Math.PI / 6), to.y - ARROW_HEAD * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(to.x - ARROW_HEAD * Math.cos(angle + Math.PI / 6), to.y - ARROW_HEAD * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export interface TokenLook {
  color: string
  name?: string
  selected?: boolean
  // 원의 반지름 (무대 좌표). 없으면 기본 크기.
  radius?: number
}

// 원의 중심이 (0, 0)에 오도록 그린다. 부르는 쪽이 미리 옮겨 둔다.
export function drawToken(ctx: FrameContext, look: TokenLook): void {
  const radius = look.radius ?? TOKEN_RADIUS
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = look.color
  ctx.fill()
  ctx.lineWidth = look.selected ? 4 : 2
  ctx.strokeStyle = look.selected ? SELECTED : 'rgba(0, 0, 0, 0.25)'
  ctx.stroke()
  if (look.name) {
    ctx.font = NAME_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = OUTLINE
    ctx.strokeText(look.name, 0, radius + 4)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(look.name, 0, radius + 4)
  }
  ctx.restore()
}

export function drawBall(ctx: FrameContext): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#16181d'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, BALL_RADIUS * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = '#16181d'
  ctx.fill()
  ctx.restore()
}

// 도착 위치를 고칠 때 화면에만 보이는 안내: 움직인 선수·공의 시작 자리와 거기서 온 길. 내보내는 파일에는 그리지 않는다.
export function drawGhosts(ctx: FrameContext, project: TacticProject, from: Record<string, Point>, to: Record<string, Point>): void {
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  const radii = new Map(project.tokens.map((token) => [token.id, tokenRadius(project.tokenScale, token.scale)]))
  for (const id of [...radii.keys(), BALL_ID]) {
    if (!from[id] || !to[id] || (from[id].x === to[id].x && from[id].y === to[id].y)) continue
    const a = toStage(from[id])
    const b = toStage(to[id])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(a.x, a.y, radii.get(id) ?? BALL_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function at(ctx: FrameContext, position: Point, draw: () => void): void {
  const { x, y } = toStage(position)
  ctx.save()
  ctx.translate(x, y)
  draw()
  ctx.restore()
}

// 내보내기(PNG·GIF·MP4)가 모두 쓰는 한 장 그리기. 높이는 무대 비율을 따른다고 가정한다.
export function drawFrame(
  ctx: FrameContext,
  project: TacticProject,
  positions: Record<string, Point>,
  width: number,
  shapes: Shape[] = [],
): void {
  const scale = width / STAGE_W
  ctx.save()
  ctx.scale(scale, scale)
  drawPitch(ctx, project.pitchColor)
  for (const shape of shapes) drawShape(ctx, shape)
  for (const token of project.tokens) {
    const position = positions[token.id]
    if (position) {
      const look = { color: token.color ?? project.teamColors[token.team], name: token.name, radius: tokenRadius(project.tokenScale, token.scale) }
      at(ctx, position, () => drawToken(ctx, look))
    }
  }
  const ball = positions[BALL_ID]
  if (ball) at(ctx, ball, () => drawBall(ctx))
  ctx.restore()
}
