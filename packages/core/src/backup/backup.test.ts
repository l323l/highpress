import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Column, TacticProject, Team } from '../db/types'
import { crc32, decodeBase64, utf8Length } from './bytes'
import { BACKUP_MAX_BYTES, BACKUP_MESSAGES, BackupError, keepOwned, oneBest } from './format'
import { openBackup } from './open'
import { BACKUP_FORMAT, BACKUP_MANIFEST, writeBackup, writeBackupBytes, type BackupInput, type BackupMediaSource } from './v2'

const column = (over: Partial<Column> = {}): Column => ({
  id: 'c1',
  title: '내 칼럼',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '압박' }] }, { type: 'image', attrs: { mediaId: 'm1', src: null } }] },
  teamId: 't1',
  isBest: false,
  status: 'saved',
  publishedUrl: 'https://cafe.naver.com/x/1',
  serverSyncedAt: null,
  createdAt: 1,
  updatedAt: 2,
  ...over,
})
const team: Team = { id: 't1', name: '토트넘', color: '#132257' }
const project: TacticProject = {
  id: 'p1',
  columnId: 'c1',
  teamColors: { a: '#0000ff', b: '#ff00ff' },
  tokens: [{ id: 'k1', team: 'a', name: '손흥민' }],
  scenes: [{ id: 's1', positions: { k1: { x: 0.5, y: 0.5 } }, durationMs: 1000, shapes: [] }],
  updatedAt: 3,
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
const JPG = new Uint8Array(3000).map((_, i) => (i * 7) % 256)

const media = (id: string, mime: string, data: Uint8Array | null, over: Partial<BackupMediaSource> = {}): BackupMediaSource => ({
  id,
  columnId: 'c1',
  kind: 'image',
  mime,
  name: `${id}.bin`,
  tacticProjectId: null,
  createdAt: 5,
  width: 2560,
  height: 1440,
  load: async () => data,
  ...over,
})

const input = (over: Partial<BackupInput> = {}): BackupInput => ({
  columns: [column()],
  teams: [team],
  tacticProjects: [project],
  media: [media('m1', 'image/png', PNG), media('m2', 'image/jpeg', JPG)],
  ...over,
})

const META = { exportedAt: Date.UTC(2026, 9, 25), source: 'app' as const }

// ZIP 안의 manifest 를 고쳐 다시 묶는다 (조작된 백업 흉내).
function tamper(zip: Uint8Array, edit: (manifest: Record<string, unknown>, files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(zip)
  const manifest = JSON.parse(strFromU8(files[BACKUP_MANIFEST])) as Record<string, unknown>
  edit(manifest, files)
  files[BACKUP_MANIFEST] = strToU8(JSON.stringify(manifest))
  return zipSync(files)
}

describe('백업 v2 만들기 → 열기', () => {
  it('칼럼 · 팀 · 전술 · 사진이 그대로 돌아온다', async () => {
    const zip = await writeBackupBytes(input(), META)
    expect([zip[0], zip[1]]).toEqual([0x50, 0x4b])
    const opened = openBackup(zip)
    expect(opened).toMatchObject({ version: 2, source: 'app', exportedAt: META.exportedAt, skipped: 0 })
    expect(opened.columns).toEqual([column()])
    expect(opened.teams).toEqual([team])
    expect(opened.tacticProjects).toEqual([project])
    expect(opened.media.map((m) => [m.id, m.kind, m.mime, m.width])).toEqual([
      ['m1', 'image', 'image/png', 2560],
      ['m2', 'image', 'image/jpeg', 2560],
    ])
    expect(opened.readMedia('m1')).toEqual(PNG)
    expect(opened.readMedia('m2')).toEqual(JPG)
    expect(opened.readMedia('nope')).toBeNull()
  })

  it('ZIP 안은 manifest.json 과 media/<id>.<확장자> 뿐이고, 사진마다 크기 · CRC 를 적는다', async () => {
    const files = unzipSync(await writeBackupBytes(input(), META))
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'media/m1.png', 'media/m2.jpg'])
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest).toMatchObject({ format: BACKUP_FORMAT, version: 2, source: 'app' })
    expect(manifest.media[0]).toMatchObject({ id: 'm1', file: 'media/m1.png', bytes: PNG.length, crc32: crc32(PNG) })
  })

  it('읽지 못한 사진 · 받지 않는 형식 · 같은 id 는 빼고 센다', async () => {
    const result = await writeBackup(
      input({ media: [media('m1', 'image/png', PNG), media('m1', 'image/png', PNG), media('svg', 'image/svg+xml', PNG), media('gone', 'image/png', null), media('../x', 'image/png', PNG)] }),
      () => undefined,
      META,
    )
    expect(result).toMatchObject({ media: 1, skipped: 4 })
  })

  it('피드 구단 · 대표 사진 선택도 옮기고, 서버 사본 표시는 지운다', async () => {
    const zip = await writeBackupBytes(input({ columns: [column({ feedClub: 'tot', feedCover: '', serverSyncedAt: 9, status: 'draft' })] }), META)
    const [c] = openBackup(zip).columns
    expect(c).toMatchObject({ feedClub: 'tot', feedCover: '', serverSyncedAt: null, status: 'draft' })
  })

  it('조각을 흘려보내는 쪽에서 실패하면 그대로 알린다', async () => {
    await expect(writeBackup(input(), () => Promise.reject(new Error('disk full')), META)).rejects.toThrow('disk full')
  })
})

describe('v2 열기: 잘못된 파일로 기존 데이터를 망가뜨리지 않는다', () => {
  it('ZIP 도 JSON 도 아니면 거절한다', () => {
    expect(() => openBackup(strToU8('hello'))).toThrow(BACKUP_MESSAGES.notReadable)
  })

  it('깨진 ZIP 은 거절한다', async () => {
    const zip = await writeBackupBytes(input(), META)
    expect(() => openBackup(zip.slice(0, zip.length - 30))).toThrow(BackupError)
  })

  it('manifest 가 없거나 다른 형식이면 이 앱의 파일이 아니다', () => {
    expect(() => openBackup(zipSync({ 'a.txt': strToU8('x') }))).toThrow(BACKUP_MESSAGES.notOurs)
    expect(() => openBackup(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'other', version: 2 })) }))).toThrow(BACKUP_MESSAGES.notOurs)
    expect(() => openBackup(zipSync({ 'manifest.json': strToU8('{broken') }))).toThrow(BACKUP_MESSAGES.broken)
  })

  it('더 새 버전의 백업은 거절한다', () => {
    const zip = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: BACKUP_FORMAT, version: 3 })) })
    expect(() => openBackup(zip)).toThrow(BACKUP_MESSAGES.newer)
  })

  it('200MB 를 넘는 파일은 열지 않는다', () => {
    const big = { length: BACKUP_MAX_BYTES + 1 } as Uint8Array
    expect(() => openBackup(big)).toThrow(BACKUP_MESSAGES.tooBig)
  })

  it('CRC · 크기가 맞지 않는 사진은 그 사진만 건너뛴다', async () => {
    const zip = tamper(await writeBackupBytes(input(), META), (_m, files) => {
      files['media/m1.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9])
    })
    const opened = openBackup(zip)
    expect(opened.readMedia('m1')).toBeNull()
    expect(opened.readMedia('m2')).toEqual(JPG)
  })

  it('manifest 의 파일 경로를 믿지 않는다 (../ · 다른 id · 없는 파일 · 한도 초과)', async () => {
    const zip = tamper(await writeBackupBytes(input(), META), (manifest, files) => {
      const list = manifest.media as Record<string, unknown>[]
      list[0].file = '../../etc/passwd'
      list[1].file = 'media/m1.png'
      list.push({ ...list[1], id: 'ghost', file: 'media/ghost.jpg' })
      list.push({ ...list[1], id: 'svg', mime: 'image/svg+xml', file: 'media/svg.svg' })
      files['media/svg.svg'] = strToU8('<svg onload="alert(1)"/>')
    })
    const opened = openBackup(zip)
    expect(opened.media).toEqual([])
    expect(opened.skipped).toBe(4)
  })

  it('압축 폭탄: 목록에 적힌 크기보다 크게 풀지 않고, 큰 manifest 는 열지 않는다', () => {
    const huge = new Uint8Array(70 * 1024 * 1024)
    const zip = zipSync({ 'manifest.json': [huge, { level: 9 }] })
    expect(zip.length).toBeLessThan(1024 * 1024)
    expect(() => openBackup(zip)).toThrow(BACKUP_MESSAGES.tooBig)
  })

  it('형식이 틀린 칼럼 · 전술은 그것만 버린다', async () => {
    const zip = tamper(await writeBackupBytes(input(), META), (manifest) => {
      ;(manifest.columns as unknown[]).push({ id: 'x' }, { ...column({ id: 'c2' }), body: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.example/p.gif', mediaId: 'm9' } }] } })
      ;(manifest.tacticProjects as unknown[]).push({ ...project, id: 'p2', scenes: [] })
    })
    const opened = openBackup(zip)
    expect(opened.columns.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(JSON.stringify(opened.columns[1].body)).not.toContain('evil.example')
    expect(opened.tacticProjects.map((p) => p.id)).toEqual(['p1'])
    expect(opened.skipped).toBe(2)
  })
})

describe('v1(JSON) 읽기', () => {
  const v1 = (over: Record<string, unknown> = {}) =>
    strToU8(
      JSON.stringify({
        app: 'football-column-app',
        schemaVersion: 1,
        exportedAt: 7,
        columns: [column()],
        teams: [team],
        tacticProjects: [project],
        media: [
          { id: 'm1', columnId: 'c1', kind: 'image', temp: false, mime: 'image/png', name: 'p.png', size: 3, tacticProjectId: null, createdAt: 4, dataUrl: 'data:image/png;base64,CQgH' },
          { id: 'svg', columnId: 'c1', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' },
          { id: 'bad', columnId: 'c1', dataUrl: 'data:image/png;base64,=AAA' },
        ],
        ...over,
      }),
    )

  it('웹이 쓰던 v1 파일을 연다', () => {
    const opened = openBackup(v1())
    expect(opened).toMatchObject({ version: 1, source: 'web', exportedAt: 7 })
    expect(opened.columns).toEqual([column()])
    expect(opened.tacticProjects).toEqual([project])
    expect(opened.media.map((m) => m.id)).toEqual(['m1', 'bad'])
    // SVG 는 처음부터, 깨진 base64 는 꺼낼 때 버린다.
    expect(opened.skipped).toBe(1)
    expect(opened.readMedia('m1')).toEqual(new Uint8Array([9, 8, 7]))
    expect(opened.readMedia('bad')).toBeNull()
  })

  it('다른 앱 · 더 새 구조 · JSON 아님을 거절한다', () => {
    expect(() => openBackup(v1({ app: 'other' }))).toThrow(BACKUP_MESSAGES.notOurs)
    expect(() => openBackup(v1({ schemaVersion: 2 }))).toThrow(BACKUP_MESSAGES.newer)
    expect(() => openBackup(strToU8('not json'))).toThrow('JSON 형식이 아닙니다')
  })
})

describe('가져오기 도우미', () => {
  it('가져오는 칼럼의 것만, 다른 칼럼 소유는 덮어쓰지 않는다', () => {
    const items = [
      { id: 'a', columnId: 'c1' },
      { id: 'b', columnId: 'c9' },
      { id: 'c', columnId: 'c1' },
      { id: 'd', columnId: 'c1' },
    ]
    expect(keepOwned(items, new Set(['c1']), new Map([['c', 'other'], ['d', 'c1']])).map((i) => i.id)).toEqual(['a', 'd'])
  })

  it('베스트는 마지막 한 편만 남긴다', () => {
    expect(oneBest([column({ id: 'a', isBest: true }), column({ id: 'b', isBest: true }), column({ id: 'c' })]).map((c) => c.isBest)).toEqual([false, true, false])
  })
})

describe('바이트 도구', () => {
  it('CRC-32 는 표준 값과 같다', () => {
    expect(crc32(strToU8('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('base64 를 푼다 (끝의 = 는 없어도 된다)', () => {
    const cases: [string, string][] = [['', ''], ['YQ==', 'a'], ['YWI=', 'ab'], ['YWJj', 'abc'], ['YWJjZA', 'abcd'], ['7ZWc6riA', '한글']]
    for (const [text, plain] of cases) expect(decodeBase64(text)).toEqual(strToU8(plain))
    for (const bad of ['=AAA', 'A', 'YW=J', 'YQ=', '한글']) expect(decodeBase64(bad)).toBeNull()
  })

  it('UTF-8 바이트 수를 센다', () => {
    for (const text of ['', 'abc', '한글 칼럼', '🙂 압박', '\ud800x', 'é']) expect(utf8Length(text)).toBe(strToU8(text).length)
  })
})
