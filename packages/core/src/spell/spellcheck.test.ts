import { describe, expect, it } from 'vitest'
import { checkText } from './rules'

const fixes = (text: string) => checkText(text).map((issue) => `${issue.wrong}→${issue.right}`)

// 고칠 곳을 모두 고친 글.
function corrected(text: string): string {
  let out = text
  for (const issue of checkText(text).reverse()) out = out.slice(0, issue.from) + issue.right + out.slice(issue.to)
  return out
}

describe('맞춤법 검사 규칙', () => {
  it('되/돼와 자주 틀리는 낱말을 잡는다', () => {
    expect(fixes('교체가 됬다')).toEqual(['됬→됐'])
    expect(fixes('그렇게 하면 안 되요')).toEqual(['되요→돼요'])
    expect(fixes('몇일 뒤 오랫만에 선발로 나왔다')).toEqual(['몇일→며칠', '오랫만→오랜만'])
    expect(fixes('수비형 미드필더 역활을 맡았다')).toEqual(['역활→역할'])
    expect(fixes('약점이 들어났다')).toEqual(['들어났→드러났'])
  })

  it('위치를 글자 단위로 알려 준다', () => {
    const [issue] = checkText('전반에는 금새 무너졌다')
    expect(issue).toMatchObject({ from: 5, to: 7, wrong: '금새', right: '금세' })
  })

  it('-ㄹ게와 의존 명사 띄어쓰기를 고친다', () => {
    expect(corrected('다음 글에서 다룰께요')).toBe('다음 글에서 다룰게요')
    expect(corrected('막을수있었다')).toBe('막을 수 있었다')
    expect(corrected('막을 수없었다')).toBe('막을 수 없었다')
    expect(corrected('이길것같다')).toBe('이길것 같다')
  })

  it('축구 글에 자주 나오는 외래어 표기를 고친다', () => {
    expect(corrected('패널티 박스 안에서 쓰루패스를 받았다')).toBe('페널티 박스 안에서 스루패스를 받았다')
    expect(corrected('세레머니와 리더쉽')).toBe('세리머니와 리더십')
  })

  it('공백과 문장 부호를 다듬는다', () => {
    expect(corrected('전반은  좋았다 . 후반은 달랐다')).toBe('전반은 좋았다. 후반은 달랐다')
  })

  it('맞는 글은 건드리지 않는다', () => {
    const fine = [
      '선생님께 여쭤봤다',
      '껄껄 웃었다',
      '수없이 많은 기회가 있었다',
      '그 아이예요',
      '교체가 됐고 경기는 달라졌다',
      '며칠 동안 훈련을 쉬었다',
      '점유율은 61.4%였다',
      '막을 수 있었다',
      '콘셉트는 분명했다',
    ]
    for (const text of fine) expect(checkText(text), text).toEqual([])
  })

  it('겹치는 곳은 하나만 알려 준다', () => {
    const issues = checkText('않되요')
    expect(issues).toHaveLength(1)
    expect(issues[0].from).toBe(0)
  })
})
