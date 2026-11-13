// 프로필 사진. 서버의 공개 보관함(avatars)에 있고, 위치는 "<사용자 id>/<올린 시각>.webp" 꼴이다 (0011_avatar.sql).

// 올리는 사진의 크기와 무게. 서버 한도(200KB)보다 조금 작게 잡는다.
export const AVATAR = { edge: 256, maxBytes: 190_000 } as const

const PATH = /^[0-9a-f-]{36}\/[0-9]{10,16}\.(webp|jpg)$/

// 사진을 바로 열 수 있는 주소. 서버 설정이 없거나 위치가 정해진 꼴이 아니면 null (그때는 이름 첫 글자를 보여 준다).
export function avatarUrl(path: string | null | undefined): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base || !path || !PATH.test(path)) return null
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/avatars/${path}`
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/webp') return resolve(blob)
        // webp 로 만들지 못하는 브라우저는 jpeg 로 만든다.
        canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('encode'))), 'image/jpeg', quality)
      },
      'image/webp',
      quality,
    )
  })
}

// 고른 사진의 가운데를 정사각형으로 잘라 256px 로 줄인다. 원본은 기기 밖으로 나가지 않는다.
export async function makeAvatar(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR.edge
    canvas.height = AVATAR.edge
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas')
    // 투명한 곳은 흰 바탕으로 채운다 (jpeg 로 떨어질 때 검게 나오지 않게).
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, AVATAR.edge, AVATAR.edge)
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR.edge, AVATAR.edge)
    for (const quality of [0.86, 0.74, 0.6, 0.45]) {
      const blob = await encode(canvas, quality)
      if (blob.size <= AVATAR.maxBytes) return blob
    }
    throw new Error('avatar too big')
  } finally {
    bitmap.close()
  }
}
