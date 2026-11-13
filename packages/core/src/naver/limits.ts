// 네이버 카페에 올릴 때의 한도. 서버 함수(supabase/functions/naver/index.ts)와 같은 값이어야 한다.
// 네이버가 받는 실제 한도는 확인하지 못했다. 서버 함수가 다룰 수 있는 크기에 맞춘 값이다.
export const NAVER_LIMITS = { subject: 100, contentBytes: 400_000, images: 10, imageBytes: 3_000_000, totalBytes: 12_000_000, imageEdge: 1600 } as const
