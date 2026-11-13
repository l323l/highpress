import type Konva from 'konva'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Arrow, Circle, Ellipse, Group, Image as KonvaImage, Label, Layer, Line, Rect, Shape, Stage, Tag, Text, Transformer } from 'react-konva'
import { clampPoint, headSize, inkOn, markFromDrag, moveMark, strokeWidth, unitOf, wavePoints, type Mark, type NewMark, type Point, type Size, type StrokeSize, type ToolId } from '@highpress/core/photo'

export interface PhotoCanvasHandle {
  // 화면의 고르기 표시는 빼고 바탕 사진 크기 그대로 내보낸다.
  toBlob: (type: 'image/jpeg' | 'image/png', quality?: number) => Promise<Blob>
}

interface Props {
  ref?: Ref<PhotoCanvasHandle>
  base: CanvasImageSource
  size: Size
  marks: Mark[]
  tool: ToolId
  style: { color: string; size: StrokeSize }
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (mark: NewMark) => void
  // 글자 · 번호처럼 누른 자리에 놓는 도구
  onPlace: (point: Point) => void
  onChange: (mark: Mark) => void
  onEditText: (id: string) => void
}

const FONT = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
const SHADOW = 'rgba(0, 0, 0, 0.55)'
// 조명 바깥을 덮는 어둠
const DIM = 'rgba(6, 9, 8, 0.6)'

const flat = (...points: Point[]) => points.flatMap((p) => [p.x, p.y])

// 화살표가 그리는 꺾은선. 곡선은 가운데 손잡이를 지나고, 드리블은 물결친다.
function arrowPoints(mark: Extract<Mark, { kind: 'arrow' }>, size: Size): number[] {
  if (mark.variant === 'curve') return flat(mark.from, mark.mid, mark.to)
  if (mark.variant === 'dribble') {
    const u = unitOf(size)
    const w = strokeWidth(size, mark.size)
    return wavePoints(mark.from, mark.to, Math.max(w * 1.6, u * 7), u * 34, headSize(w).length * 1.6)
  }
  return flat(mark.from, mark.to)
}

type Handle = 'from' | 'to' | 'mid'

export function PhotoCanvas({ ref, base, size, marks, tool, style, selectedId, onSelect, onCreate, onPlace, onChange, onEditText }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const marksLayer = useRef<Konva.Layer>(null)
  const uiLayer = useRef<Konva.Layer>(null)
  const transformer = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<string, Konva.Node>())
  const [scale, setScale] = useState(0)
  const [draft, setDraft] = useState<{ from: Point; to: Point } | null>(null)
  // 손잡이를 끄는 동안의 모양. 손을 떼면 onChange 로 넘긴다.
  const [live, setLive] = useState<Mark | null>(null)

  // 칸 크기가 바뀔 때마다 사진 비율을 유지하며 맞춘다.
  useEffect(() => {
    const element = holder.current
    if (!element) return
    const fit = () => {
      const { width, height } = element.getBoundingClientRect()
      setScale(Math.max(0.01, Math.min(width / size.width, height / size.height)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [size.width, size.height])

  const selected = marks.find((mark) => mark.id === selectedId) ?? null
  const transformable = selected !== null && ['ring', 'spot', 'zone', 'text', 'number'].includes(selected.kind)
  const keepRatio = selected?.kind === 'text' || selected?.kind === 'number'

  useEffect(() => {
    const tr = transformer.current
    if (!tr) return
    const node = selected && transformable ? nodes.current.get(selected.id) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selected, transformable, marks])

  useImperativeHandle(
    ref,
    () => ({
      toBlob: (type, quality = 0.92) => {
        const stage = stageRef.current
        const ui = uiLayer.current
        if (!stage || scale === 0) return Promise.reject(new Error('not-ready'))
        ui?.visible(false)
        const canvas = stage.toCanvas({ pixelRatio: 1 / scale })
        ui?.visible(true)
        return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), type, quality))
      },
    }),
    [scale],
  )

  // 사진 좌표의 포인터 위치. 무대의 배율만 걸려 있으므로 레이어 기준으로 읽는다.
  const pointer = (): Point | null => {
    const p = marksLayer.current?.getRelativePointerPosition()
    return p ? clampPoint(p, size) : null
  }

  const drawing = tool !== 'select'

  const onDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (!drawing) {
      // 사진(빈 곳)을 누르면 고르기를 푼다.
      if (event.target === event.target.getStage() || event.target.name() === 'base') onSelect(null)
      return
    }
    const p = pointer()
    if (p) setDraft({ from: p, to: p })
  }
  const onMove = () => {
    if (!draft) return
    const p = pointer()
    if (p) setDraft({ ...draft, to: p })
  }
  const onUp = () => {
    if (!draft) return
    const { from, to } = draft
    setDraft(null)
    const mark = markFromDrag(tool, from, to, size, style)
    if (mark) onCreate(mark)
    else if (tool === 'text' || tool === 'number') onPlace(from)
  }

  const u = unitOf(size)
  const px = (screen: number) => screen / Math.max(scale, 0.01)
  const register = (id: string) => (node: Konva.Node | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }
  const current = (mark: Mark) => (live && live.id === mark.id ? live : mark)

  // 표시 하나 그리기. preview 는 끄는 동안 미리 보여 주는 모양이다 (누를 수 없다).
  const renderMark = (raw: Mark, preview = false) => {
    const mark = current(raw)
    const common = {
      ref: preview ? undefined : register(mark.id),
      draggable: !preview && !drawing,
      listening: !preview,
      onPointerDown: () => {
        if (!drawing) onSelect(mark.id)
      },
      // 끌어 옮긴 거리만큼 좌표를 옮긴다. 화살표 · 선은 노드를 제자리로 돌린다.
      onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
        const node = event.target
        if (mark.kind === 'arrow' || mark.kind === 'line') {
          const dx = node.x()
          const dy = node.y()
          node.position({ x: 0, y: 0 })
          onChange(moveMark(mark, dx, dy))
        } else onChange(moveMark(mark, node.x() - mark.x, node.y() - mark.y))
      },
    }
    // 끌어서 크기를 바꾼 만큼 값에 넣고 노드의 배율은 1로 돌린다.
    const transformEnd = (apply: (sx: number, sy: number, x: number, y: number) => Mark) => (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target
      const sx = node.scaleX()
      const sy = node.scaleY()
      node.scale({ x: 1, y: 1 })
      onChange(apply(sx, sy, node.x(), node.y()))
    }

    switch (mark.kind) {
      case 'arrow': {
        const w = strokeWidth(size, mark.size)
        const head = headSize(w)
        return (
          <Arrow
            key={mark.id}
            {...common}
            points={arrowPoints(mark, size)}
            tension={mark.variant === 'curve' ? 0.5 : mark.variant === 'dribble' ? 0.35 : 0}
            stroke={mark.color}
            fill={mark.color}
            strokeWidth={w}
            pointerLength={head.length}
            pointerWidth={head.width}
            dash={mark.variant === 'run' || mark.variant === 'curve' ? [w * 2.2, w * 1.7] : undefined}
            lineCap="round"
            lineJoin="round"
            shadowColor={SHADOW}
            shadowBlur={w * 1.6}
            shadowOffsetY={w * 0.3}
            hitStrokeWidth={Math.max(w * 4, 26 * u)}
          />
        )
      }
      case 'line': {
        const w = strokeWidth(size, mark.size)
        return (
          <Line
            key={mark.id}
            {...common}
            points={flat(mark.from, mark.to)}
            stroke={mark.color}
            strokeWidth={w}
            lineCap="round"
            shadowColor={SHADOW}
            shadowBlur={w * 1.6}
            shadowOffsetY={w * 0.3}
            hitStrokeWidth={Math.max(w * 4, 26 * u)}
          />
        )
      }
      case 'ring': {
        const w = strokeWidth(size, mark.size)
        return (
          <Group
            key={mark.id}
            {...common}
            x={mark.x}
            y={mark.y}
            onTransformEnd={transformEnd((sx, sy, x, y) => ({ ...mark, x, y, rx: Math.max(6 * u, mark.rx * sx), ry: Math.max(3 * u, mark.ry * sy) }))}
          >
            {/* 발밑에 깔린 빛처럼: 안쪽은 옅게 채우고 테두리는 또렷하게 */}
            <Ellipse radiusX={mark.rx} radiusY={mark.ry} fill={mark.color} opacity={0.22} />
            <Ellipse radiusX={mark.rx} radiusY={mark.ry} stroke={mark.color} strokeWidth={w} shadowColor={mark.color} shadowBlur={w * 3} shadowOpacity={0.7} />
          </Group>
        )
      }
      case 'spot':
        // 어둠은 아래의 조명 레이어가 그린다. 여기는 고르고 옮길 수 있는 투명한 자리다.
        return (
          <Ellipse
            key={mark.id}
            {...common}
            x={mark.x}
            y={mark.y}
            radiusX={mark.rx}
            radiusY={mark.ry}
            fill="rgba(255, 255, 255, 0.001)"
            // 고른 조명의 테두리는 화면 전용 레이어(아래)에 그린다. 내보내는 파일에 남지 않게.
            stroke={preview ? '#ffffff' : undefined}
            strokeWidth={px(2)}
            dash={[px(6), px(6)]}
            onTransformEnd={transformEnd((sx, sy, x, y) => ({ ...mark, x, y, rx: Math.max(12 * u, mark.rx * sx), ry: Math.max(12 * u, mark.ry * sy) }))}
          />
        )
      case 'zone': {
        const w = strokeWidth(size, mark.size)
        return (
          <Group
            key={mark.id}
            {...common}
            x={mark.x}
            y={mark.y}
            onTransformEnd={transformEnd((sx, sy, x, y) => ({ ...mark, x, y, w: Math.max(10 * u, mark.w * sx), h: Math.max(10 * u, mark.h * sy) }))}
          >
            <Rect width={mark.w} height={mark.h} fill={mark.color} opacity={0.24} cornerRadius={w} />
            <Rect width={mark.w} height={mark.h} stroke={mark.color} strokeWidth={w * 0.8} dash={[w * 2.4, w * 1.6]} cornerRadius={w} />
          </Group>
        )
      }
      case 'text':
        return (
          <Label
            key={mark.id}
            {...common}
            x={mark.x}
            y={mark.y}
            onDblClick={() => onEditText(mark.id)}
            onDblTap={() => onEditText(mark.id)}
            onTransformEnd={transformEnd((_sx, sy, x, y) => ({ ...mark, x, y, fontSize: Math.min(220 * u, Math.max(10 * u, mark.fontSize * sy)) }))}
          >
            {mark.boxed && <Tag fill={mark.color} cornerRadius={mark.fontSize * 0.26} shadowColor={SHADOW} shadowBlur={mark.fontSize * 0.4} shadowOffsetY={mark.fontSize * 0.08} />}
            <Text
              text={mark.text || ' '}
              fontFamily={FONT}
              fontStyle="800"
              fontSize={mark.fontSize}
              padding={mark.boxed ? mark.fontSize * 0.34 : 0}
              fill={mark.boxed ? inkOn(mark.color) : mark.color}
              stroke={mark.boxed ? undefined : 'rgba(0, 0, 0, 0.75)'}
              strokeWidth={mark.boxed ? 0 : mark.fontSize * 0.14}
              fillAfterStrokeEnabled
              lineJoin="round"
            />
          </Label>
        )
      case 'number':
        return (
          <Group
            key={mark.id}
            {...common}
            x={mark.x}
            y={mark.y}
            onTransformEnd={transformEnd((_sx, sy, x, y) => ({ ...mark, x, y, r: Math.min(120 * u, Math.max(8 * u, mark.r * sy)) }))}
          >
            <Circle radius={mark.r} fill={mark.color} stroke="rgba(0, 0, 0, 0.35)" strokeWidth={mark.r * 0.08} shadowColor={SHADOW} shadowBlur={mark.r * 0.5} shadowOffsetY={mark.r * 0.1} />
            <Text
              text={String(mark.value)}
              x={-mark.r}
              y={-mark.r}
              width={mark.r * 2}
              height={mark.r * 2}
              align="center"
              verticalAlign="middle"
              fontFamily={FONT}
              fontStyle="800"
              fontSize={mark.r * (mark.value >= 10 ? 1 : 1.15)}
              fill={inkOn(mark.color)}
            />
          </Group>
        )
    }
  }

  const draftMark = draft ? markFromDrag(tool, draft.from, draft.to, size, style) : null
  const preview = draftMark ? ({ ...draftMark, id: 'draft' } as Mark) : null
  const spots = [...marks, ...(preview ? [preview] : [])].map(current).filter((mark): mark is Extract<Mark, { kind: 'spot' }> => mark.kind === 'spot')

  // 화살표 · 선의 끝점과 곡선의 가운데를 끄는 손잡이
  const shown = selected ? current(selected) : null
  const handles: { key: Handle; point: Point }[] =
    shown && (shown.kind === 'arrow' || shown.kind === 'line')
      ? [
          { key: 'from', point: shown.from },
          { key: 'to', point: shown.to },
          ...(shown.kind === 'arrow' && shown.variant === 'curve' ? [{ key: 'mid' as const, point: shown.mid }] : []),
        ]
      : []

  const moveHandle = (key: Handle, point: Point, done: boolean) => {
    if (!shown || (shown.kind !== 'arrow' && shown.kind !== 'line')) return
    const next = { ...shown, [key]: clampPoint(point, size) } as Mark
    if (done) {
      setLive(null)
      onChange(next)
    } else setLive(next)
  }

  return (
    <div ref={holder} className="photo-canvas" data-tool={tool}>
      {scale > 0 && (
        <Stage
          ref={stageRef}
          width={Math.round(size.width * scale)}
          height={Math.round(size.height * scale)}
          scaleX={scale}
          scaleY={scale}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <Layer>
            <KonvaImage name="base" image={base as HTMLCanvasElement} width={size.width} height={size.height} />
          </Layer>
          {spots.length > 0 && (
            <Layer listening={false}>
              <Shape
                sceneFunc={(context) => {
                  const ctx = context._context
                  ctx.save()
                  ctx.fillStyle = DIM
                  ctx.fillRect(0, 0, size.width, size.height)
                  // 조명 자리를 가장자리가 부드럽게 도려낸다.
                  ctx.globalCompositeOperation = 'destination-out'
                  for (const spot of spots) {
                    ctx.save()
                    ctx.translate(spot.x, spot.y)
                    ctx.scale(1, spot.ry / spot.rx)
                    const gradient = ctx.createRadialGradient(0, 0, spot.rx * 0.7, 0, 0, spot.rx * 1.08)
                    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
                    ctx.fillStyle = gradient
                    ctx.beginPath()
                    ctx.arc(0, 0, spot.rx * 1.08, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.restore()
                  }
                  ctx.restore()
                }}
              />
            </Layer>
          )}
          <Layer ref={marksLayer} listening={!drawing}>
            {marks.map((mark) => renderMark(mark))}
            {preview && renderMark(preview, true)}
          </Layer>
          <Layer ref={uiLayer}>
            {shown?.kind === 'spot' && (
              <Ellipse x={shown.x} y={shown.y} radiusX={shown.rx} radiusY={shown.ry} stroke="#ffffff" strokeWidth={px(2)} dash={[px(6), px(6)]} listening={false} />
            )}
            <Transformer
              ref={transformer}
              rotateEnabled={false}
              flipEnabled={false}
              keepRatio={keepRatio}
              // 작은 표시가 손잡이에 가려지지 않게 모서리(와 좌우)만 두고 조금 띄운다.
              enabledAnchors={keepRatio ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']}
              padding={6}
              anchorSize={9}
              anchorCornerRadius={5}
              anchorStroke="#111113"
              anchorFill="#ffffff"
              borderStroke="#ffffff"
              borderDash={[4, 4]}
              ignoreStroke
            />
            {handles.map((handle) => (
              <Circle
                key={handle.key}
                x={handle.point.x}
                y={handle.point.y}
                radius={px(8)}
                fill={handle.key === 'mid' ? '#111113' : '#ffffff'}
                stroke={handle.key === 'mid' ? '#ffffff' : '#111113'}
                strokeWidth={px(2)}
                hitStrokeWidth={px(16)}
                draggable
                onDragMove={(event) => moveHandle(handle.key, event.target.position(), false)}
                onDragEnd={(event) => moveHandle(handle.key, event.target.position(), true)}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
