/// <reference types="node" />
import { Blob as NodeBlob } from 'node:buffer'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openBackup } from '@highpress/core/backup'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_FILES,
  SAMPLE_COLUMNS,
  SAMPLE_MEDIA,
  SAMPLE_TACTIC,
  SAMPLE_TEAM,
  SAMPLE_TEMP_MEDIA,
  sampleV1,
} from '../../packages/core/src/backup/fixtures/sample'
import { exportBackup, importBackup } from './backup'
import { db } from './db'
import { createColumn, getMediaBlob, putMedia, saveTeam, updateColumn } from './store'
import { SCHEMA_VERSION } from './types'

// jsdom의 Blob은 fake-indexeddb의 structuredClone을 거치면 빈 객체가 되므로 Node Blob과 이를 읽는 FileReader로 바꿔 쓴다.
class NodeFileReader {
  result: string | null = null
  error: Error | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`
        this.onload?.()
      },
      (e) => {
        this.error = e
        this.onerror?.()
      },
    )
  }
}

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('FileReader', NodeFileReader)
})
afterAll(() => {
  vi.unstubAllGlobals()
})

const file = (data: unknown) => new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/json' })
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())
const clearAll = () => Promise.all(db.tables.map((t) => t.clear()))

const validColumn = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  title: '제목',
  body: { type: 'doc', content: [] },
  teamId: null,
  isBest: false,
  status: 'saved',
  publishedUrl: '',
  createdAt: 1,
  updatedAt: 2,
  ...over,
})

const backup = (over: Record<string, unknown> = {}) => ({
  app: 'football-column-app',
  schemaVersion: SCHEMA_VERSION,
  exportedAt: 1,
  columns: [],
  teams: [],
  tacticProjects: [],
  media: [],
  ...over,
})

describe('백업 내보내기 → 가져오기', () => {
  it('지운 뒤 가져오면 칼럼·팀·이미지가 복원된다', async () => {
    const team = await saveTeam({ name: 'A팀', color: '#ff0000' })
    const c = await createColumn()
    await updateColumn(c.id, { title: '내 칼럼', teamId: team.id, publishedUrl: 'https://example.com/1' })
    const m = await putMedia({ columnId: c.id, kind: 'image', temp: false, blob: new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }), name: 'p.png' })

    const exported = await exportBackup()
    // v2: ZIP 파일이다
    expect(exported.type).toBe('application/zip')
    expect(openBackup(await bytesOf(exported))).toMatchObject({ version: 2, source: 'web' })
    await clearAll()
    const result = await importBackup(exported)

    expect(result).toEqual({ columns: 1, skipped: 0 })
    expect(await db.columns.get(c.id)).toMatchObject({ title: '내 칼럼', teamId: team.id, publishedUrl: 'https://example.com/1' })
    expect(await db.teams.get(team.id)).toEqual(team)
    const blob = await getMediaBlob(m.id)
    expect(blob!.type).toBe('image/png')
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
  })
})

describe('importBackup 검증', () => {
  it('JSON이 아니면 거부한다', async () => {
    await expect(importBackup(file('not json'))).rejects.toThrow('JSON 형식이 아닙니다')
  })

  it('다른 앱의 파일은 거부한다', async () => {
    await expect(importBackup(file(backup({ app: 'other' })))).rejects.toThrow('이 앱의 백업 파일이 아닙니다')
  })

  it('더 최신 schemaVersion은 거부한다', async () => {
    await expect(importBackup(file(backup({ schemaVersion: SCHEMA_VERSION + 1 })))).rejects.toThrow('더 최신 버전')
  })

  it('javascript: 게시 링크는 비우고 http(s)는 유지한다', async () => {
    await importBackup(
      file(backup({ columns: [validColumn({ id: 'bad', publishedUrl: 'javascript:alert(1)' }), validColumn({ id: 'ok', publishedUrl: 'https://cafe.example/1' })] })),
    )
    expect((await db.columns.get('bad'))!.publishedUrl).toBe('')
    expect((await db.columns.get('ok'))!.publishedUrl).toBe('https://cafe.example/1')
  })

  it('SVG data URL 이미지는 버리고 skipped로 센다', async () => {
    const svg = `data:image/svg+xml;base64,${btoa('<svg onload="alert(1)"/>')}`
    const png = `data:image/png;base64,${btoa('abc')}`
    const result = await importBackup(
      file(backup({ columns: [validColumn()], media: [
        { id: 'm-svg', columnId: 'c1', dataUrl: svg },
        { id: 'm-png', columnId: 'c1', dataUrl: png },
      ] })),
    )
    expect(result.skipped).toBe(1)
    expect(await db.media.get('m-svg')).toBeUndefined()
    expect(await db.media.get('m-png')).toBeDefined()
  })

  it('형식이 틀린 칼럼은 건너뛴다', async () => {
    const result = await importBackup(file(backup({ columns: [validColumn(), { id: 'x' }] })))
    expect(result).toEqual({ columns: 1, skipped: 1 })
  })

  it('백업에 베스트가 있으면 기기의 기존 베스트를 푼다', async () => {
    const local = await createColumn()
    await db.columns.update(local.id, { isBest: true })
    await importBackup(file(backup({ columns: [validColumn({ isBest: true })] })))
    expect((await db.columns.toArray()).filter((c) => c.isBest).map((c) => c.id)).toEqual(['c1'])
  })
})

describe('조작된 백업 방어', () => {
  const PNG = 'data:image/png;base64,AAEC'
  const project = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    columnId: 'c1',
    teamColors: { a: '#0000ff', b: '#ff00ff' },
    tokens: [{ id: 't1', team: 'a' }],
    scenes: [{ id: 's1', positions: { t1: { x: 0.5, y: 0.5 } }, durationMs: 1000 }],
    ...over,
  })

  it('모양이 틀린 본문은 그 칼럼만 건너뛰고 나머지는 가져온다', async () => {
    let deep: Record<string, unknown> = { type: 'paragraph' }
    for (let i = 0; i < 300; i++) deep = { type: 'blockquote', content: [deep] }
    const result = await importBackup(
      file(
        backup({
          columns: [
            validColumn({ id: 'bad1', body: { type: 'doc', content: 'x' } }),
            validColumn({ id: 'bad2', body: { type: 'doc', content: [deep] } }),
            validColumn({ id: 'ok', body: { type: 'doc', content: [null, { type: 'paragraph' }] } }),
          ],
        }),
      ),
    )
    expect(result).toEqual({ columns: 2, skipped: 1 })
    expect((await db.columns.get('bad1'))?.body).toEqual({ type: 'doc' })
    expect((await db.columns.get('ok'))?.body).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(await db.columns.get('bad2')).toBeUndefined()
  })

  it('본문 이미지의 외부 src를 버린다', async () => {
    const body = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.example/p.gif', mediaId: 'm1' } }] }
    await importBackup(file(backup({ columns: [validColumn({ body })] })))
    expect((await db.columns.get('c1'))?.body.content?.[0].attrs).toEqual({ src: null, mediaId: 'm1' })
  })

  it('전술 프로젝트의 이동 시간·좌표를 한도로 맞추고 모르는 토큰 키는 버린다', async () => {
    const scenes = [
      { id: 's1', positions: JSON.parse('{"t1":{"x":7,"y":-3},"__proto__":{"x":0,"y":0},"toString":{"x":0,"y":0}}'), durationMs: 1e8 },
    ]
    await importBackup(file(backup({ columns: [validColumn()], tacticProjects: [project({ scenes })] })))
    const saved = await db.tacticProjects.get('p1')
    expect(saved?.scenes[0].durationMs).toBe(5000)
    expect(saved?.scenes[0].positions).toEqual({ t1: { x: 1, y: 0 } })
  })

  it('공 위치·선수 이름과 색·배경색·도형을 가져오고, 모양이 틀린 것은 버린다', async () => {
    const tokens = [
      { id: 't1', team: 'a', name: '아주아주아주 긴 선수 이름입니다', color: '#ffd43b' },
      { id: 't2', team: 'b', name: 7, color: 'red' },
    ]
    const shapes = [
      { id: 'sh1', kind: 'arrow', dashed: true, color: '#ff0000', from: { x: 0.1, y: 0.2 }, to: { x: 9, y: -9 } },
      { id: 'sh2', kind: 'ellipse', color: '#00ff00', from: { x: 0, y: 0 }, to: { x: 0.5, y: 0.5 } },
      { id: 'bad1', kind: 'star', color: '#00ff00', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
      { id: 'bad2', kind: 'line', color: 'url(javascript:1)', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
      { id: 'bad3', kind: 'line', color: '#000000', from: { x: 0, y: 0 } },
    ]
    const scenes = [{ id: 's1', positions: { t1: { x: 0.5, y: 0.5 }, ball: { x: 2, y: 0.3 }, stranger: { x: 0, y: 0 } }, durationMs: 1000, shapes }]
    await importBackup(file(backup({ columns: [validColumn()], tacticProjects: [project({ tokens, scenes, pitchColor: '#2f9e44' })] })))

    const saved = await db.tacticProjects.get('p1')
    expect(saved?.pitchColor).toBe('#2f9e44')
    expect(saved?.tokens).toEqual([
      // 이름은 10자까지
      { id: 't1', team: 'a', name: '아주아주아주 긴 선', color: '#ffd43b' },
      { id: 't2', team: 'b' },
    ])
    expect(saved?.scenes[0].positions).toEqual({ t1: { x: 0.5, y: 0.5 }, ball: { x: 1, y: 0.3 } })
    expect(saved?.scenes[0].shapes).toEqual([
      { id: 'sh1', kind: 'arrow', dashed: true, color: '#ff0000', from: { x: 0.1, y: 0.2 }, to: { x: 1, y: 0 } },
      { id: 'sh2', kind: 'ellipse', dashed: false, color: '#00ff00', from: { x: 0, y: 0 }, to: { x: 0.5, y: 0.5 } },
    ])
  })

  it('도형이 너무 많으면 한도까지만 가져온다', async () => {
    const shapes = Array.from({ length: 60 }, (_, i) => ({ id: `sh${i}`, kind: 'line', color: '#000000', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }))
    const scenes = [{ id: 's1', positions: {}, durationMs: 1000, shapes }]
    await importBackup(file(backup({ columns: [validColumn()], tacticProjects: [project({ scenes })] })))
    expect((await db.tacticProjects.get('p1'))?.scenes[0].shapes).toHaveLength(40)
  })

  it('장면이 너무 많은 전술 프로젝트는 건너뛴다', async () => {
    const scenes = Array.from({ length: 51 }, (_, i) => ({ id: `s${i}`, positions: {}, durationMs: 1000 }))
    const result = await importBackup(file(backup({ columns: [validColumn()], tacticProjects: [project({ scenes })] })))
    expect(result.skipped).toBe(1)
    expect(await db.tacticProjects.count()).toBe(0)
  })

  it('깨진 base64 이미지는 그 항목만 건너뛴다', async () => {
    const media = [
      { id: 'm1', columnId: 'c1', dataUrl: 'data:image/png;base64,=AAA' },
      { id: 'm2', columnId: 'c1', dataUrl: PNG },
    ]
    const result = await importBackup(file(backup({ columns: [validColumn()], media })))
    expect(result).toEqual({ columns: 1, skipped: 1 })
    expect(await db.media.toCollection().primaryKeys()).toEqual(['m2'])
  })

  it('가져오는 칼럼에 딸리지 않았거나 다른 칼럼 소유인 미디어·전술 프로젝트는 덮어쓰지 않는다', async () => {
    const mine = await createColumn()
    const kept = await putMedia({ columnId: mine.id, kind: 'image', temp: false, blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), name: 'mine.png' })
    await db.tacticProjects.add({ ...project({ id: 'mineP', columnId: mine.id }), updatedAt: 1 } as never)

    const result = await importBackup(
      file(
        backup({
          columns: [validColumn()],
          media: [
            { id: kept.id, columnId: 'c1', dataUrl: PNG },
            { id: 'stray', columnId: 'not-imported', dataUrl: PNG },
          ],
          tacticProjects: [project({ id: 'mineP' })],
        }),
      ),
    )
    expect(result.skipped).toBe(3)
    expect((await db.media.get(kept.id))?.columnId).toBe(mine.id)
    expect(await db.media.get('stray')).toBeUndefined()
    expect((await db.tacticProjects.get('mineP'))?.columnId).toBe(mine.id)
  })

  it('계정 정보가 든 게시 링크는 버린다', async () => {
    await importBackup(file(backup({ columns: [validColumn({ publishedUrl: 'https://cafe.naver.com@evil.example/' })] })))
    expect((await db.columns.get('c1'))?.publishedUrl).toBe('')
  })

  it('덮어쓰기를 거절하면 아무것도 쓰지 않는다', async () => {
    await importBackup(file(backup({ columns: [validColumn({ title: '기기 글' })] })))
    await expect(
      importBackup(file(backup({ columns: [validColumn({ title: '백업 글' })] })), { confirmOverwrite: () => false }),
    ).rejects.toThrow('취소')
    expect((await db.columns.get('c1'))?.title).toBe('기기 글')
  })
})

// ── 웹 ↔ 앱 주고받기 (A4-8) ─────────────────────────────
// 같은 내용(packages/core/src/backup/fixtures/sample.ts)을 웹이 내보낸 파일(web-v2.zip)은 앱 시험이,
// 앱이 내보낸 파일(app-v2.zip)은 이 시험이 가져온다. HP_WRITE_BACKUP_FIXTURES=1 이면 web-v2.zip 을 다시 쓴다.
// vitest 는 저장소 맨 위에서 돈다
const fixture = (name: string) => join(process.cwd(), 'packages/core/src/backup/fixtures', name)

async function putSample() {
  await db.teams.put(SAMPLE_TEAM)
  await db.columns.bulkPut(SAMPLE_COLUMNS)
  await db.tacticProjects.put(SAMPLE_TACTIC)
  for (const m of [...SAMPLE_MEDIA, SAMPLE_TEMP_MEDIA]) {
    const { data, width: _w, height: _h, ...rest } = m
    await db.media.put({ ...rest, temp: m === SAMPLE_TEMP_MEDIA, size: data.length, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: m.mime }) })
  }
}

// 기기(Dexie)에 든 것이 sample 과 같은지. 백업에서 가져왔다면 임시 결과물은 없다.
async function expectSampleOnDevice(hasTemp = false) {
  expect(await db.columns.orderBy('id').toArray()).toEqual([...SAMPLE_COLUMNS].sort((a, b) => a.id.localeCompare(b.id)))
  expect(await db.teams.toArray()).toEqual([SAMPLE_TEAM])
  expect(await db.tacticProjects.toArray()).toEqual([SAMPLE_TACTIC])
  expect(!!(await db.media.get(SAMPLE_TEMP_MEDIA.id))).toBe(hasTemp)
  for (const m of SAMPLE_MEDIA) {
    expect(await db.media.get(m.id)).toMatchObject({ columnId: m.columnId, kind: m.kind, mime: m.mime, name: m.name, temp: false, size: m.data.length, createdAt: m.createdAt })
    expect(await bytesOf((await getMediaBlob(m.id))!)).toEqual(m.data)
  }
}

// 백업 파일 안의 내용 (언제 · 어디서 만들었는지는 빼고)
function contentOf(bytes: Uint8Array) {
  const opened = openBackup(bytes)
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id))
  return {
    columns: byId(opened.columns),
    teams: byId(opened.teams),
    tacticProjects: byId(opened.tacticProjects),
    media: byId(opened.media).map(({ width: _w, height: _h, ...m }) => ({ ...m, data: opened.readMedia(m.id) })),
    skipped: opened.skipped,
  }
}

describe('웹 ↔ 앱 백업 주고받기 (v2)', () => {
  it('웹이 내보낸 파일에는 sample 이 그대로 들고, 임시 결과물은 빠진다 (→ web-v2.zip)', async () => {
    await putSample()
    const zip = await bytesOf(await exportBackup())
    const content = contentOf(zip)
    expect(content.media.map((m) => m.id)).toEqual(['media-jpg', 'media-png'])
    if (process.env.HP_WRITE_BACKUP_FIXTURES === '1') writeFileSync(fixture(FIXTURE_FILES.web), zip)
    // 앱 시험이 읽는 web-v2.zip 이 지금 웹이 내보내는 것과 같은 내용인지 (오래된 파일이면 위 환경 변수로 다시 만든다)
    expect(contentOf(readFileSync(fixture(FIXTURE_FILES.web)))).toEqual(content)
  })

  it('웹이 내보낸 파일을 지운 뒤 다시 가져오면 그대로다', async () => {
    await putSample()
    const exported = await exportBackup()
    await clearAll()
    expect(await importBackup(exported)).toEqual({ columns: 2, skipped: 0 })
    await expectSampleOnDevice()
  })

  it.skipIf(!existsSync(fixture(FIXTURE_FILES.app)))('앱이 내보낸 파일(app-v2.zip)을 가져오고, 다시 내보내면 같은 내용이다', async () => {
    const appZip = new Uint8Array(readFileSync(fixture(FIXTURE_FILES.app)))
    expect(openBackup(appZip).source).toBe('app')
    expect(await importBackup(new Blob([appZip]))).toEqual({ columns: 2, skipped: 0 })
    await expectSampleOnDevice()
    expect(contentOf(await bytesOf(await exportBackup()))).toEqual(contentOf(appZip))
  })

  it('예전 웹의 v1 파일도 가져온다', async () => {
    expect(await importBackup(new Blob([sampleV1() as Uint8Array<ArrayBuffer>]))).toEqual({ columns: 2, skipped: 0 })
    await expectSampleOnDevice()
  })

  it('잘못된 파일은 기기의 칼럼을 건드리지 않는다', async () => {
    await putSample()
    const zip = await bytesOf(await exportBackup())
    for (const bad of [zip.slice(0, zip.length / 2), new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), new TextEncoder().encode('{"app":"football-column-app","schemaVersion":99}')]) {
      await expect(importBackup(new Blob([bad]))).rejects.toThrow()
    }
    await expectSampleOnDevice(true)
  })
})
