import { describe, expect, it } from 'vitest'
import { cafeMultipart, ms949Bytes, readCafeResult } from '../../../supabase/functions/naver/cafe'

const text = (bytes: Uint8Array) => new TextDecoder('euc-kr').decode(bytes)

describe('네이버 카페 요청 만들기', () => {
  it('한글은 옛 한글 방식(MS949) 두 바이트로, 영문은 그대로 바꾼다', () => {
    expect(Array.from(ms949Bytes('A가'))).toEqual([0x41, 0xb0, 0xa1])
    expect(text(ms949Bytes('하이프레스 시험 · 아스널 24'))).toBe('하이프레스 시험 · 아스널 24')
  })

  it('그 방식에 없는 글자는 &#숫자; 로 바꾼다', () => {
    expect(text(ms949Bytes('골⚽'))).toBe('골&#9917;')
    // 두 칸짜리 글자(이모지)도 한 글자로 센다.
    expect(text(ms949Bytes('😀'))).toBe('&#128512;')
  })

  it('제목·본문·사진을 한 요청으로 묶고, 파일 이름은 영문으로 다시 짓는다', () => {
    const body = cafeMultipart('제목', '<p>본문</p>', [{ type: 'image/jpeg', bytes: Uint8Array.of(1, 2, 3) }, { type: 'image/gif', bytes: Uint8Array.of(4) }], 'hp-boundary-1234')
    const seen = text(body)
    expect(seen).toContain('--hp-boundary-1234\r\nContent-Disposition: form-data; name="subject"\r\n\r\n제목\r\n')
    expect(seen).toContain('name="content"\r\n\r\n<p>본문</p>\r\n')
    expect(seen).toContain('name="image"; filename="photo1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n')
    expect(seen).toContain('name="image"; filename="photo2.gif"\r\nContent-Type: image/gif\r\n\r\n')
    expect(seen.endsWith('--hp-boundary-1234--\r\n')).toBe(true)
    // 제목은 UTF-8(세 바이트)이 아니라 MS949(두 바이트)로 들어간다.
    expect(body.length).toBeLessThan(new TextEncoder().encode(seen).length)
  })

  it('받지 않는 사진 형식과 이상한 구분 글자는 거절한다', () => {
    expect(() => cafeMultipart('a', 'b', [{ type: 'image/webp', bytes: Uint8Array.of(1) }], 'hp-boundary-1234')).toThrow()
    expect(() => cafeMultipart('a', 'b', [], 'x\r\ny')).toThrow()
  })

  it('네이버의 응답에서 글 주소나 거절 이유를 읽는다', () => {
    expect(readCafeResult(200, '{"message":{"status":"200","result":{"msg":"Success","articleUrl":"https://cafe.naver.com/greenap4bq/5"}}}')).toEqual({ ok: true, url: 'https://cafe.naver.com/greenap4bq/5' })
    expect(readCafeResult(403, '{"message":{"status":"500","error":{"code":"999","message":"게시글을 연속으로 등록할 수 없습니다. 잠시 후 다시 시도해주세요."}}}')).toMatchObject({ ok: false, reason: 'too-fast' })
    expect(readCafeResult(403, '{"message":{"status":"500","error":{"code":"999","msg":"오류가 발생하였습니다."}}}')).toMatchObject({ ok: false, reason: 'failed', detail: '오류가 발생하였습니다.' })
    expect(readCafeResult(401, 'x')).toMatchObject({ ok: false, reason: 'login' })
    // 성공이라도 네이버 카페 주소가 아니면 믿지 않는다.
    expect(readCafeResult(200, '{"message":{"result":{"articleUrl":"https://evil.example/1"}}}')).toMatchObject({ ok: false })
  })
})
