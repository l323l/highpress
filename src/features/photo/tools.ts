import type { Icon } from '@phosphor-icons/react'
import {
  ArrowBendUpRightIcon,
  ArrowUpRightIcon,
  CircleIcon,
  CursorIcon,
  FlashlightIcon,
  LineSegmentIcon,
  NumberCircleOneIcon,
  PersonSimpleRunIcon,
  RectangleDashedIcon,
  SneakerMoveIcon,
  TextTIcon,
} from '../../components/icons'
import type { ToolId } from '@highpress/core/photo'

export interface ToolInfo {
  id: ToolId
  label: string
  icon: Icon
  hint: string
}

// 뜻이 같은 도구끼리 묶는다: 고르기 / 선 그리기 / 강조 / 글.
export const TOOL_GROUPS: { name: string; tools: ToolInfo[] }[] = [
  { name: '고르기', tools: [{ id: 'select', label: '고르기', icon: CursorIcon, hint: '표시를 누르면 고르고, 끌면 옮깁니다. 고른 뒤 모서리를 끌면 크기가 바뀝니다.' }] },
  {
    name: '선',
    tools: [
      { id: 'pass', label: '패스', icon: ArrowUpRightIcon, hint: '공이 가는 길입니다. 사진 위에서 끌어 긋습니다.' },
      { id: 'run', label: '움직임', icon: PersonSimpleRunIcon, hint: '공 없이 뛰는 길입니다 (점선). 끌어 긋습니다.' },
      { id: 'curve', label: '곡선 침투', icon: ArrowBendUpRightIcon, hint: '끌어 그은 뒤, 가운데 검은 점을 옮겨 휘는 정도를 정합니다.' },
      { id: 'dribble', label: '드리블', icon: SneakerMoveIcon, hint: '공을 몰고 가는 길입니다 (물결). 끌어 긋습니다.' },
      { id: 'line', label: '선', icon: LineSegmentIcon, hint: '수비 라인이나 선수 사이 간격을 잇습니다.' },
    ],
  },
  {
    name: '강조',
    tools: [
      { id: 'ring', label: '선수 원', icon: CircleIcon, hint: '선수 발밑을 누르면 원이 깔립니다. 옆으로 끌면 그 너비로 깔립니다.' },
      { id: 'spot', label: '조명', icon: FlashlightIcon, hint: '누른 자리만 밝게 남기고 나머지를 어둡게 합니다. 끌면 크기가 바뀝니다.' },
      { id: 'zone', label: '공간', icon: RectangleDashedIcon, hint: '끌어서 비어 있는 공간을 칠합니다.' },
    ],
  },
  {
    name: '글',
    tools: [
      { id: 'text', label: '글자', icon: TextTIcon, hint: '누른 자리에 글자를 놓고, 아래 칸에서 내용을 고칩니다.' },
      { id: 'number', label: '번호', icon: NumberCircleOneIcon, hint: '누를 때마다 1, 2, 3 순서로 번호가 놓입니다.' },
    ],
  },
]

export const TOOLS = TOOL_GROUPS.flatMap((group) => group.tools)
