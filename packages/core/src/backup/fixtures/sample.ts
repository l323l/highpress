import { strToU8 } from 'fflate'
import type { Column, TacticProject, Team } from '../../db/types'
import type { BackupMediaInfo } from '../format'

// 웹 ↔ 앱 백업 주고받기 시험에 쓰는 같은 내용 (A4-8).
// 웹 시험(src/db/backup.test.ts)은 이 내용을 Dexie 에 넣고 내보내 web-v2.zip 을, 앱 시험(mobile/src/db/backup.test.ts)은
// sqlite 에 넣고 내보내 app-v2.zip 을 만든다. 그리고 서로 상대가 만든 파일을 가져와 이 내용과 같은지 본다.
// 파일 다시 만들기: HP_WRITE_BACKUP_FIXTURES=1 로 두 시험을 돌린다.

export const SAMPLE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5])
export const SAMPLE_JPG = Uint8Array.from({ length: 4096 }, (_, i) => (i * 31 + 7) % 256)

export const SAMPLE_TEAM: Team = { id: 'team-tot', name: '토트넘', color: '#132257' }

export const SAMPLE_COLUMNS: Column[] = [
  {
    id: 'col-saved',
    title: '높은 압박의 대가 🙂',
    body: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '전방 압박이 ' }, { type: 'text', marks: [{ type: 'bold' }], text: '무너진' }, { type: 'text', text: ' 이유' }] },
        { type: 'image', attrs: { mediaId: 'media-png', src: null, alt: '압박 장면' } },
        { type: 'image', attrs: { mediaId: 'media-jpg', src: null, alt: '' } },
      ],
    },
    teamId: 'team-tot',
    isBest: true,
    status: 'saved',
    publishedUrl: 'https://cafe.naver.com/highpress/1',
    feedClub: 'tot',
    feedCover: 'media-jpg',
    serverSyncedAt: null,
    createdAt: 1_761_000_000_000,
    updatedAt: 1_761_000_500_000,
  },
  {
    id: 'col-draft',
    title: '쓰는 중인 글',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '이어서 쓸 내용' }] }] },
    teamId: null,
    isBest: false,
    status: 'draft',
    publishedUrl: '',
    feedCover: '',
    serverSyncedAt: null,
    createdAt: 1_761_100_000_000,
    updatedAt: 1_761_100_000_001,
  },
]

export const SAMPLE_TACTIC: TacticProject = {
  id: 'tac-1',
  columnId: 'col-saved',
  teamColors: { a: '#132257', b: '#ff0000' },
  pitchColor: '#2f9e44',
  tokens: [
    { id: 'k1', team: 'a', name: '손흥민', color: '#ffd43b' },
    { id: 'k2', team: 'b' },
  ],
  scenes: [
    {
      id: 's1',
      positions: { k1: { x: 0.5, y: 0.25 }, k2: { x: 0.4, y: 0.6 }, ball: { x: 0.5, y: 0.5 } },
      start: { k1: { x: 0.5, y: 0.5 } },
      durationMs: 1200,
      shapes: [{ id: 'sh1', kind: 'arrow', dashed: true, color: '#ffffff', from: { x: 0.1, y: 0.1 }, to: { x: 0.9, y: 0.9 } }],
    },
  ],
  updatedAt: 1_761_000_400_000,
}

export interface SampleMedia extends BackupMediaInfo {
  data: Uint8Array
}

export const SAMPLE_MEDIA: SampleMedia[] = [
  { id: 'media-png', columnId: 'col-saved', kind: 'image', mime: 'image/png', name: 'press.png', tacticProjectId: null, createdAt: 1_761_000_100_000, width: null, height: null, data: SAMPLE_PNG },
  { id: 'media-jpg', columnId: 'col-saved', kind: 'image', mime: 'image/jpeg', name: 'photo.jpg', tacticProjectId: null, createdAt: 1_761_000_200_000, width: null, height: null, data: SAMPLE_JPG },
]

// 백업에 들어가지 않아야 하는 임시 결과물 (전술 GIF 등)
export const SAMPLE_TEMP_MEDIA: SampleMedia = {
  id: 'media-temp',
  columnId: 'col-saved',
  kind: 'gif',
  mime: 'image/gif',
  name: 'tactic.gif',
  tacticProjectId: 'tac-1',
  createdAt: 1_761_000_300_000,
  width: null,
  height: null,
  data: strToU8('GIF89a-temp'),
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function toBase64(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const n = (data[i] << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < data.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < data.length ? B64[n & 63] : '=')
  }
  return out
}

// 예전 웹(v0.24.0 까지)이 내보내던 v1 JSON 과 같은 꼴
export function sampleV1(): Uint8Array {
  return strToU8(
    JSON.stringify({
      app: 'football-column-app',
      schemaVersion: 1,
      exportedAt: 1_761_200_000_000,
      columns: SAMPLE_COLUMNS,
      teams: [SAMPLE_TEAM],
      tacticProjects: [SAMPLE_TACTIC],
      media: SAMPLE_MEDIA.map(({ data, width: _w, height: _h, ...rest }) => ({ ...rest, temp: false, size: data.length, dataUrl: `data:${rest.mime};base64,${toBase64(data)}` })),
    }),
  )
}

export const FIXTURE_FILES = { web: 'web-v2.zip', app: 'app-v2.zip' } as const
