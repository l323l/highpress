import type Konva from 'konva'
import { useEffect, useRef, useState } from 'react'
import { Layer, Shape as KonvaShape, Stage } from 'react-konva'
import { BALL_ID, type Point, type Shape, type ShapeKind, type TacticProject } from '@highpress/core/db'
import { drawBall, drawGhosts, drawPitch, drawShape, drawToken, shapePath, BALL_RADIUS, clampPoint, fitStage, PITCH, tokenRadius, toNormalised, toStage, type StageFit } from '@highpress/core/tactics'

// null이면 이동(고르기·끌기) 도구, 아니면 그 도형을 그리는 도구.
export type Tool = { kind: ShapeKind; dashed: boolean } | null

export interface Selection {
  type: 'token' | 'shape'
  id: string
}

interface BoardProps {
  project: TacticProject
  positions: Record<string, Point>
  shapes?: Shape[]
  // 이 장면의 시작 위치. 주면 움직인 선수의 시작 자리와 이동 경로를 흐리게 보여 준다.
  ghost?: Record<string, Point>
  draggable: boolean
  tool?: Tool
  shapeColor?: string
  selection?: Selection | null
  onMoveToken: (tokenId: string, point: Point) => void
  onSelect?: (selection: Selection | null) => void
  onAddShape?: (shape: Omit<Shape, 'id'>) => void
  onMoveShape?: (shapeId: string, dx: number, dy: number) => void
}

// 이보다 짧게 끈 것은 실수로 누른 것으로 보고 도형을 만들지 않는다 (무대 좌표).
const MIN_SHAPE_SIZE = 14
const HIT_PADDING = 8

export function Board({
  project,
  positions,
  shapes = [],
  ghost,
  draggable,
  tool = null,
  shapeColor = '#ffffff',
  selection = null,
  onMoveToken,
  onSelect,
  onAddShape,
  onMoveShape,
}: BoardProps) {
  const holder = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<StageFit>({ width: 0, height: 0, scale: 0 })
  const [draft, setDraft] = useState<{ from: Point; to: Point } | null>(null)
  const drawing = draggable && tool !== null

  // 분할선이 움직여 칸 크기가 바뀔 때마다 비율을 유지하며 다시 맞춘다 (M-11).
  useEffect(() => {
    const element = holder.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setFit(fitStage(entry.contentRect.width, entry.contentRect.height))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // dragBoundFunc는 배율이 적용된 화면 좌표로 들어온다.
  const keepInsidePitch = (pos: Point): Point => {
    const inside = toStage(clampPoint(toNormalised({ x: pos.x / fit.scale, y: pos.y / fit.scale })))
    return { x: inside.x * fit.scale, y: inside.y * fit.scale }
  }

  const pointerPoint = (stage: Konva.Stage | null): Point | null => {
    const pos = stage?.getPointerPosition()
    return pos ? clampPoint(toNormalised({ x: pos.x / fit.scale, y: pos.y / fit.scale })) : null
  }

  const finishDraft = () => {
    if (!draft || !tool) return
    setDraft(null)
    const from = toStage(draft.from)
    const to = toStage(draft.to)
    if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_SHAPE_SIZE) return
    onAddShape?.({ ...tool, color: shapeColor, from: draft.from, to: draft.to })
  }

  // 누를 수 있는 영역은 Konva의 도우미를 거치지 않고 직접 칠한다 (colorKey로 어느 노드인지 구분된다).
  const hitCircle = (radius: number) => (context: Konva.Context, node: Konva.Shape) => {
    const ctx = context._context
    ctx.beginPath()
    ctx.arc(0, 0, radius + HIT_PADDING, 0, Math.PI * 2)
    ctx.fillStyle = node.colorKey
    ctx.fill()
  }

  return (
    <div className={drawing ? 'tactics-board tactics-board--drawing' : 'tactics-board'} ref={holder} role="img" aria-label="전술판">
      {fit.scale > 0 && (
        <Stage
          width={fit.width}
          height={fit.height}
          scaleX={fit.scale}
          scaleY={fit.scale}
          onPointerDown={(event) => {
            const stage = event.target.getStage()
            if (drawing) {
              const point = pointerPoint(stage)
              if (point) setDraft({ from: point, to: point })
            } else if (event.target === stage) {
              onSelect?.(null)
            }
          }}
          onPointerMove={(event) => {
            if (!draft) return
            const point = pointerPoint(event.target.getStage())
            if (point) setDraft({ from: draft.from, to: point })
          }}
          onPointerUp={finishDraft}
          onPointerLeave={finishDraft}
        >
          <Layer listening={false}>
            <KonvaShape sceneFunc={(context) => drawPitch(context._context, project.pitchColor)} />
            {ghost && <KonvaShape sceneFunc={(context) => drawGhosts(context._context, project, ghost, positions)} />}
          </Layer>
          {/* 도형을 그리는 동안에는 토큰·도형이 포인터를 가로채지 않게 한다. */}
          <Layer listening={draggable && !drawing}>
            {shapes.map((shape) => {
              const selected = selection?.type === 'shape' && selection.id === shape.id
              return (
                <KonvaShape
                  key={shape.id}
                  draggable={draggable}
                  sceneFunc={(context) => drawShape(context._context, shape, selected)}
                  hitFunc={(context, node) => {
                    const ctx = context._context
                    shapePath(ctx, shape)
                    ctx.lineWidth = 26
                    ctx.strokeStyle = node.colorKey
                    ctx.stroke()
                  }}
                  onPointerDown={() => onSelect?.({ type: 'shape', id: shape.id })}
                  onDragEnd={(event) => {
                    // 도형은 무대 좌표로 직접 그리므로, 끈 만큼만 데이터에 반영하고 노드는 제자리로 돌린다.
                    const node = event.target
                    const dx = node.x() / PITCH.width
                    const dy = node.y() / PITCH.height
                    node.position({ x: 0, y: 0 })
                    onMoveShape?.(shape.id, dx, dy)
                  }}
                />
              )
            })}
            {project.tokens.map((token) => {
              const position = positions[token.id]
              if (!position) return null
              const selected = selection?.type === 'token' && selection.id === token.id
              const color = token.color ?? project.teamColors[token.team]
              const radius = tokenRadius(project.tokenScale, token.scale)
              return (
                <KonvaShape
                  key={token.id}
                  {...toStage(position)}
                  draggable={draggable}
                  dragBoundFunc={keepInsidePitch}
                  sceneFunc={(context) => drawToken(context._context, { color, name: token.name, selected, radius })}
                  hitFunc={hitCircle(radius)}
                  onPointerDown={() => onSelect?.({ type: 'token', id: token.id })}
                  onDragEnd={(event) => onMoveToken(token.id, toNormalised(event.target.position()))}
                />
              )
            })}
            {positions[BALL_ID] && (
              <KonvaShape
                {...toStage(positions[BALL_ID])}
                draggable={draggable}
                dragBoundFunc={keepInsidePitch}
                sceneFunc={(context) => drawBall(context._context)}
                hitFunc={hitCircle(BALL_RADIUS)}
                onPointerDown={() => onSelect?.(null)}
                onDragEnd={(event) => onMoveToken(BALL_ID, toNormalised(event.target.position()))}
              />
            )}
          </Layer>
          {draft && tool && (
            <Layer listening={false}>
              <KonvaShape sceneFunc={(context) => drawShape(context._context, { id: 'draft', ...tool, color: shapeColor, ...draft })} />
            </Layer>
          )}
        </Stage>
      )}
    </div>
  )
}
