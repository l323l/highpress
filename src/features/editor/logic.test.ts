import { describe, expect, it } from 'vitest'
import { getSetting } from '../../db/store'
import { TACTIC_DRAG_MIME } from '@highpress/core/body'
import { IMAGE_MAX_BYTES, splitImageFiles, validateImageFile } from './imageFiles'
import { clampRatio, loadSplitRatio, ratioFromKey, ratioFromPointer, saveSplitRatio, SPLIT_RATIO_KEY } from './splitRatio'
import { hasTacticPayload, parseTacticPayload } from './tacticDrop'

describe('분할 비율', () => {
  it('0.25~0.75로 제한한다', () => {
    expect(clampRatio(0.1)).toBe(0.25)
    expect(clampRatio(0.9)).toBe(0.75)
    expect(clampRatio(0.6)).toBe(0.6)
  })

  it('숫자가 아니면 기본값을 쓴다', () => {
    expect(clampRatio('0.6')).toBe(0.5)
    expect(clampRatio(Number.NaN)).toBe(0.5)
    expect(clampRatio(undefined)).toBe(0.5)
  })

  it('포인터 위치를 비율로 바꾼다', () => {
    const rect = { left: 100, width: 1000 }
    expect(ratioFromPointer(500, rect)).toBeCloseTo(0.4)
    expect(ratioFromPointer(0, rect)).toBe(0.25)
    expect(ratioFromPointer(5000, rect)).toBe(0.75)
    expect(ratioFromPointer(500, { left: 0, width: 0 })).toBe(0.5)
  })

  it('방향키로 조절한다', () => {
    expect(ratioFromKey('ArrowLeft', 0.5)).toBeCloseTo(0.48)
    expect(ratioFromKey('ArrowRight', 0.5)).toBeCloseTo(0.52)
    expect(ratioFromKey('ArrowRight', 0.75)).toBe(0.75)
    expect(ratioFromKey('Home', 0.5)).toBe(0.25)
    expect(ratioFromKey('End', 0.5)).toBe(0.75)
    expect(ratioFromKey('Enter', 0.5)).toBeNull()
  })

  it('마지막 비율을 기억한다', async () => {
    expect(await loadSplitRatio()).toBe(0.5)
    await saveSplitRatio(0.9)
    expect(await getSetting(SPLIT_RATIO_KEY, null)).toBe(0.75)
    expect(await loadSplitRatio()).toBe(0.75)
  })
})

describe('이미지 파일 검사', () => {
  const file = (type: string, size = 1000, name = 'a') => ({ name, type, size })

  it('PNG, JPG, GIF, WebP만 받는다', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) expect(validateImageFile(file(type))).toBeNull()
    expect(validateImageFile(file('image/svg+xml'))).toContain('이미지만')
    expect(validateImageFile(file('application/pdf'))).toContain('이미지만')
    expect(validateImageFile(file(''))).toContain('이미지만')
  })

  it('10MB를 넘거나 빈 파일은 받지 않는다', () => {
    expect(validateImageFile(file('image/png', IMAGE_MAX_BYTES))).toBeNull()
    expect(validateImageFile(file('image/png', IMAGE_MAX_BYTES + 1))).toContain('10MB')
    expect(validateImageFile(file('image/png', 0))).toContain('빈 파일')
  })

  it('받을 파일과 안내 메시지를 나눈다', () => {
    const ok = file('image/png', 10, 'ok.png')
    const { accepted, errors } = splitImageFiles([ok, file('image/svg+xml', 10, 'bad.svg')])
    expect(accepted).toEqual([ok])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('bad.svg')
  })
})

describe('모션그래픽 드롭 데이터', () => {
  it('올바른 데이터만 읽는다', () => {
    expect(parseTacticPayload('{"projectId":"abc-123","format":"gif"}')).toEqual({ projectId: 'abc-123', format: 'gif' })
    expect(parseTacticPayload('{"projectId":"abc","format":"png","extra":1}')).toEqual({ projectId: 'abc', format: 'png' })
  })

  it('모양이 다르면 null', () => {
    expect(parseTacticPayload('')).toBeNull()
    expect(parseTacticPayload('not json')).toBeNull()
    expect(parseTacticPayload('null')).toBeNull()
    expect(parseTacticPayload('{"projectId":"abc","format":"mp4"}')).toBeNull()
    expect(parseTacticPayload('{"projectId":"../x","format":"png"}')).toBeNull()
    expect(parseTacticPayload('{"projectId":7,"format":"png"}')).toBeNull()
    expect(parseTacticPayload('{"format":"png"}')).toBeNull()
  })

  it('장면 번호는 0 이상의 정수만 받는다', () => {
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":2}')).toEqual({ projectId: 'abc', format: 'png', sceneIndex: 2 })
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":0}')?.sceneIndex).toBe(0)
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":-1}')).toBeNull()
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":1.5}')).toBeNull()
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":"1"}')).toBeNull()
    expect(parseTacticPayload('{"projectId":"abc","format":"png","sceneIndex":null}')).toBeNull()
  })

  it('dataTransfer에 모션그래픽이 실렸는지 확인한다', () => {
    expect(hasTacticPayload({ types: [TACTIC_DRAG_MIME] } as unknown as DataTransfer)).toBe(true)
    expect(hasTacticPayload({ types: ['Files'] } as unknown as DataTransfer)).toBe(false)
    expect(hasTacticPayload(null)).toBe(false)
  })
})
