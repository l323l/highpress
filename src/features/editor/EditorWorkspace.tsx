import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../db/db'
import { updateColumn } from '../../db/store'
import type { Column, ColumnStatus } from '@highpress/core/db'
import { stripMediaSrc, createAutosave, saveErrorState, type Autosave, type SaveState, statusOnAutosave, statusOnSave, storedPublishedUrl } from '@highpress/core/body'
import { navigate } from '../../lib/router'
import { ExportButton } from '../export'
import { EDITING_KEY, PublishButton } from '../feed'
import { StatsPane } from '../stats'
import { TacticsPane } from '../tactics'
import { PhotoPane, type PhotoSession } from '../photo'
import { VideoPane, type VideoSession } from '../video'
import { EditorHeader } from './EditorHeader'
import { useLayoutMode } from './layoutMode'
import type { MediaUrls } from './mediaUrls'
import { SplitView } from './SplitView'
import { TabGuide } from './TabGuide'
import { useColumnEditor } from './useColumnEditor'
import { WritingPane } from './WritingPane'

type Tab = 'write' | 'stats' | 'motion' | 'video' | 'photo'

interface Props {
  column: Column
  // 미디어 src가 이 세션의 blob: URL로 채워진 본문
  initialBody: JSONContent
  urls: MediaUrls
}

export function EditorWorkspace({ column, initialBody, urls }: Props) {
  const columnId = column.id
  const teams = useLiveQuery(() => db.teams.toArray()) ?? []
  const [tab, setTab] = useState<Tab>('write')
  // 마지막으로 누른 탭 단추의 가로 가운데. 작업 창이 그 자리에서 열린다.
  const [originX, setOriginX] = useState<number | null>(null)
  const pickTab = (next: Tab, event: { currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setOriginX(rect.left + rect.width / 2)
    setTab(next)
  }
  const mode = useLayoutMode()
  // 피드에 올린 글을 고치러 들어왔으면, 고친 것이 피드에 저절로 반영되지 않는다는 것을 알린다.
  const [feedNote, setFeedNote] = useState(() => {
    try {
      return window.sessionStorage.getItem(EDITING_KEY) === columnId
    } catch {
      return false
    }
  })
  const closeFeedNote = () => {
    setFeedNote(false)
    try {
      window.sessionStorage.removeItem(EDITING_KEY)
    } catch {
      // 지우지 못해도 이 탭을 닫으면 사라진다.
    }
  }
  // 핸드폰에서는 한 번에 한 창만 보인다. 본문에 넣으면 글쓰기로 돌아가 들어간 것을 보여 준다.
  const afterInsert = () => {
    if (mode === 'single') setTab('write')
  }
  // 불러온 영상은 저장하지 않는다. 탭을 오가는 동안에만 들고 있는다.
  const [video, setVideo] = useState<VideoSession | null>(null)
  // 사진 탭의 바탕과 그린 표시도 같은 이유로 탭을 오가는 동안만 들고 있는다.
  const [photo, setPhoto] = useState<PhotoSession | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [meta, setMeta] = useState({ title: column.title, teamId: column.teamId, publishedUrl: column.publishedUrl })

  // 저장은 렌더링과 무관한 시점(타이머, 탭 숨김, 화면 이탈)에 일어나므로 최신 값을 ref로 들고 있는다.
  const metaRef = useRef(meta)
  const docRef = useRef<ProseMirrorNode | null>(null)
  const statusRef = useRef<ColumnStatus>(column.status)
  const lockedRef = useRef(false)

  const persist = async (status: ColumnStatus) => {
    const { title, teamId, publishedUrl } = metaRef.current
    await updateColumn(columnId, {
      title,
      teamId,
      publishedUrl: storedPublishedUrl(publishedUrl),
      status,
      // 잠긴 칼럼은 본문을 다시 쓰지 않는다. 화면의 본문은 일부가 빠진 것이라 원본을 덮어쓰면 안 된다.
      ...(lockedRef.current ? {} : { body: stripMediaSrc(docRef.current ? (docRef.current.toJSON() as JSONContent) : initialBody) }),
    })
    statusRef.current = status
  }

  // persist는 ref와 바뀌지 않는 props만 읽으므로 첫 렌더링의 것을 계속 써도 된다.
  const [autosave] = useState<Autosave>(() =>
    createAutosave(() => persist(statusOnAutosave(statusRef.current, metaRef.current.publishedUrl)), { onState: setSaveState }),
  )

  const columnEditor = useColumnEditor({
    columnId,
    initialBody,
    urls,
    onChange: (editor) => {
      if (lockedRef.current) return
      docRef.current = editor.state.doc
      autosave.schedule()
    },
    onLocked: () => {
      lockedRef.current = true
    },
  })

  useEffect(() => {
    const flush = () => void autosave.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [autosave])

  const changeMeta = (patch: Partial<typeof meta>) => {
    metaRef.current = { ...metaRef.current, ...patch }
    setMeta(metaRef.current)
    autosave.schedule()
  }

  const goHome = async () => {
    // 저장이 계속 실패해도(다른 탭에서 삭제 등) 화면에 갇히지 않게 한다.
    if ((await autosave.flush()) || window.confirm('저장하지 못했습니다. 저장하지 않고 나갈까요?')) navigate({ name: 'home' })
  }

  const saveDraft = () => {
    autosave.schedule()
    void autosave.flush()
  }

  const save = async () => {
    // 저장에 실패하면 홈으로 가지 않고 오류를 보여 준다.
    if (!(await autosave.flush())) return
    try {
      await persist(statusOnSave(metaRef.current.publishedUrl))
      navigate({ name: 'home' })
    } catch (error) {
      setSaveState(saveErrorState(error))
    }
  }

  return (
    <div className="editor-page" data-focus={(mode === 'single' && tab !== 'write') || undefined}>
      <EditorHeader
        title={meta.title}
        onTitleChange={(title) => changeMeta({ title })}
        teams={teams}
        teamId={meta.teamId}
        onTeamChange={(teamId) => changeMeta({ teamId })}
        publishedUrl={meta.publishedUrl}
        onPublishedUrlChange={(publishedUrl) => changeMeta({ publishedUrl })}
        saveState={saveState}
        onBack={() => void goHome()}
        onSaveDraft={saveDraft}
        onSave={() => void save()}
        actions={
          <>
            <PublishButton columnId={columnId} prepare={() => autosave.flush()} />
            <ExportButton editor={columnEditor.editor} columnId={columnId} />
          </>
        }
      />

      {feedNote && (
        <p className="editor-feed-note" role="status">
          <span>
            피드에 올린 글을 고치는 중입니다. 고친 뒤 <strong>피드에 올리기</strong>를 다시 눌러야 피드의 글이 바뀝니다.
          </span>
          <button type="button" className="btn btn-ghost" onClick={closeFeedNote}>
            닫기
          </button>
        </p>
      )}

      <div className="editor-tabs">
        <nav className="seg" role="tablist" aria-label="작업 창">
          <button type="button" role="tab" aria-selected={tab === 'stats'} onClick={(event) => pickTab('stats', event)}>
            스탯
          </button>
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={(event) => pickTab('write', event)}>
            글쓰기
          </button>
          <button type="button" role="tab" aria-selected={tab === 'motion'} onClick={(event) => pickTab('motion', event)}>
            모션
          </button>
          <button type="button" role="tab" aria-selected={tab === 'video'} onClick={(event) => pickTab('video', event)}>
            영상
          </button>
          <button type="button" role="tab" aria-selected={tab === 'photo'} onClick={(event) => pickTab('photo', event)}>
            사진
          </button>
        </nav>
      </div>

      <div className="editor-body">
        <SplitView
          mode={mode}
          paneKey={tab}
          originX={originX}
          left={<WritingPane {...columnEditor} />}
          right={
            tab === 'motion' ? (
              <TacticsPane columnId={columnId} onInsert={(payload) => {
                  void columnEditor.insertTacticPayload(payload)
                  afterInsert()
                }}
              />
            ) : tab === 'stats' ? (
              <StatsPane
                onInsert={(snapshot) => {
                  columnEditor.insertStat(snapshot)
                  afterInsert()
                }}
              />
            ) : tab === 'video' ? (
              <VideoPane session={video} onSession={setVideo} onInsertFiles={(files) => {
                  void columnEditor.insertFiles(files)
                  afterInsert()
                }}
              />
            ) : tab === 'photo' ? (
              <PhotoPane
                session={photo}
                onSession={setPhoto}
                onInsertFiles={(files) => {
                  void columnEditor.insertFiles(files)
                  afterInsert()
                }}
              />
            ) : undefined
          }
        />
      </div>

      {/* 스탯 · 모션 · 영상 · 사진 탭을 처음 눌렀을 때 탭마다 한 번씩 뜨는 사용법 안내 */}
      {tab !== 'write' && <TabGuide tab={tab} />}
    </div>
  )
}
