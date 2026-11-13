import { describe, expect, it } from 'vitest'
import {
  clampRange,
  clipProblem,
  defaultClip,
  formatTime,
  frameTimestamps,
  hasAudio,
  outputSeconds,
  outputSize,
  VIDEO_LIMITS,
  type Clip,
} from './clip'

const clip = (patch: Partial<Clip> = {}): Clip => ({ start: 10, end: 20, speed: 1, muted: false, ...patch })

describe('구간', () => {
  it('처음에는 영상 전체를 고르되 상한을 넘지 않는다', () => {
    expect(defaultClip(42.5)).toEqual({ start: 0, end: 42.5, speed: 1, muted: false })
    expect(defaultClip(5000).end).toBe(VIDEO_LIMITS.maxClipSeconds)
  })

  it('영상 밖으로 나가지 않는다', () => {
    expect(clampRange(-5, 500, 60)).toEqual({ start: 0, end: 60 })
  })

  it('시작을 끝 너머로 옮기면 끝이 밀려난다', () => {
    expect(clampRange(30, 20, 60, 'start')).toEqual({ start: 30, end: 30.2 })
  })

  it('끝을 시작 앞으로 옮기면 시작이 밀려난다', () => {
    expect(clampRange(30, 20, 60, 'end')).toEqual({ start: 19.8, end: 20 })
  })

  it('영상 끝에서도 최소 길이를 지킨다', () => {
    expect(clampRange(60, 60, 60, 'start')).toEqual({ start: 59.8, end: 60 })
    expect(clampRange(0, 0, 60, 'end')).toEqual({ start: 0, end: 0.2 })
  })

  it('숫자가 아닌 값은 영상 전체로 본다', () => {
    expect(clampRange(Number.NaN, Number.NaN, 60)).toEqual({ start: 0, end: 60 })
  })
})

describe('배속과 소리', () => {
  it('결과 길이는 구간 길이를 배속으로 나눈 값이다', () => {
    expect(outputSeconds(clip({ speed: 2 }))).toBe(5)
    expect(outputSeconds(clip({ speed: 0.25 }))).toBe(40)
  })

  it('원래 속도이고 소리 제거를 켜지 않았을 때만 소리가 들어간다', () => {
    expect(hasAudio(clip())).toBe(true)
    expect(hasAudio(clip({ muted: true }))).toBe(false)
    expect(hasAudio(clip({ speed: 2 }))).toBe(false)
  })

  it('결과 프레임마다 쓸 원본 시각을 고르게 고른다', () => {
    expect(frameTimestamps({ start: 10, end: 11, speed: 2 }, 4)).toEqual([10, 10.5])
    expect(frameTimestamps({ start: 0, end: 1, speed: 0.5 }, 2)).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('아주 짧은 구간도 프레임 하나는 나온다', () => {
    expect(frameTimestamps({ start: 3, end: 3.01, speed: 4 }, 10)).toEqual([3])
  })
})

describe('내보낼 수 없는 경우', () => {
  it('보통 구간은 문제가 없다', () => {
    expect(clipProblem(clip(), 'mp4')).toBeNull()
    expect(clipProblem(clip(), 'gif')).toBeNull()
  })

  it('구간이 상한보다 길면 막는다', () => {
    expect(clipProblem(clip({ start: 0, end: VIDEO_LIMITS.maxClipSeconds + 1 }), 'mp4')).toContain('5분')
  })

  it('느리게 해서 결과가 너무 길어지면 막는다', () => {
    expect(clipProblem(clip({ start: 0, end: 200, speed: 0.25 }), 'mp4')).toContain('결과 길이')
  })

  it('GIF는 결과 길이로 제한한다', () => {
    expect(clipProblem(clip({ start: 0, end: 20 }), 'gif')).toContain('GIF')
    expect(clipProblem(clip({ start: 0, end: 20, speed: 2 }), 'gif')).toBeNull()
    expect(clipProblem(clip({ start: 0, end: 20 }), 'mp4')).toBeNull()
  })
})

describe('결과 크기', () => {
  it('비율을 지키며 줄인다', () => {
    expect(outputSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 })
  })

  it('원본보다 키우지 않는다', () => {
    expect(outputSize(640, 360, 1080)).toEqual({ width: 640, height: 360 })
  })

  it('가로·세로를 짝수로 맞춘다', () => {
    expect(outputSize(853, 481, 480)).toEqual({ width: 852, height: 480 })
    expect(outputSize(1080, 1920, 720)).toEqual({ width: 406, height: 720 })
  })
})

describe('시간 표기', () => {
  it('분:초.소수 한 자리', () => {
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(65.34)).toBe('1:05.3')
    expect(formatTime(59.96)).toBe('1:00.0')
    expect(formatTime(Number.NaN)).toBe('0:00.0')
  })
})
