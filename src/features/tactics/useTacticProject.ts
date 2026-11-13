import { useCallback, useEffect, useRef, useState } from 'react'
import { db, newId } from '../../db/db'
import type { TacticProject } from '@highpress/core/db'
import { createDefaultProject, normalizeProject } from '@highpress/core/tactics'

const SAVE_DELAY_MS = 500

// 칼럼 하나에 전술 프로젝트 하나. 없으면 기본값을 만들어 바로 저장한다.
async function loadOrCreate(columnId: string): Promise<TacticProject> {
  return db.transaction('rw', db.tacticProjects, async () => {
    const found = await db.tacticProjects.where('columnId').equals(columnId).first()
    if (found) return normalizeProject(found)
    const created = createDefaultProject(columnId, newId)
    await db.tacticProjects.add(created)
    return created
  })
}

// 칼럼이 다른 곳에서 삭제되면 프로젝트 행도 함께 지워진다. 그때는 다시 만들지 않도록
// put 대신 "있을 때만 바꾸기"를 쓴다. 한 번의 요청이라 뒤따르는 읽기보다 항상 먼저 처리된다.
async function saveIfExists(project: TacticProject): Promise<void> {
  const next: TacticProject = { ...project, updatedAt: Date.now() }
  await db.tacticProjects
    .where('id')
    .equals(project.id)
    .modify((_stored, ref) => {
      ref.value = next
    })
}

export function useTacticProject(columnId: string) {
  const [project, setProject] = useState<TacticProject | null>(null)
  const [failed, setFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const latest = useRef<TacticProject | null>(null)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // 아직 저장하지 않은 변경을 지금 저장한다. 끌어다 놓기·본문 삽입·화면을 떠날 때 부른다.
  // 실패하면 saveFailed를 켜고 다시 던진다. 변경은 남겨 두어 다음 저장 때 다시 시도한다.
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const current = latest.current
    if (!dirty.current || !current) return
    dirty.current = false
    try {
      await saveIfExists(current)
      setSaveFailed(false)
    } catch (error) {
      dirty.current = true
      setSaveFailed(true)
      throw error
    }
  }, [])

  const update = useCallback(
    (change: (project: TacticProject) => TacticProject) => {
      const current = latest.current
      if (!current) return
      const next = change(current)
      if (next === current) return
      latest.current = next
      dirty.current = true
      setProject(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush().catch(() => undefined), SAVE_DELAY_MS)
    },
    [flush],
  )

  useEffect(() => {
    let cancelled = false
    loadOrCreate(columnId).then(
      (loaded) => {
        if (cancelled) return
        latest.current = loaded
        setProject(loaded)
        setFailed(false)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
      void flush().catch(() => undefined)
      latest.current = null
      setProject(null)
      setSaveFailed(false)
    }
  }, [columnId, flush])

  // 탭을 닫거나 다른 탭으로 넘어가기 직전의 변경도 놓치지 않는다.
  useEffect(() => {
    const save = () => void flush().catch(() => undefined)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', save)
    }
  }, [flush])

  return { project, failed, saveFailed, update, flush }
}
