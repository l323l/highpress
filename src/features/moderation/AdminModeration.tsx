import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { XIcon } from '../../components/icons'
import { toHash } from '../../lib/router'
import { MODERATION_LIMITS, REPORT_REASONS, type ReportAction, type ReportGroup, type ReportStatus } from './api'
import { ConfirmDialog } from './ConfirmDialog'
import { deleteReported, type ReportedMedia } from './deleteReported'
import { moderationErrorText, requireModeration } from './errors'
import './moderation.css'

const KIND_TEXT: Record<ReportGroup['kind'], string> = { post: '글', comment: '댓글', user: '사용자' }
const PART_TEXT = { cover: '대표 사진', avatar: '프로필 사진' } as const

// 받침이 있으면 앞의 조사, 없으면 뒤의 조사 (글을 / 사진을 … 사용자를).
const josa = (word: string, withFinal: string, without: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without)
}

const when = (ms: number) => (ms ? new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')

// 무엇이 신고됐는지: "글 · 대표 사진"처럼 종류와 사진을 함께 적는다.
const targetText = (group: ReportGroup) => [KIND_TEXT[group.kind] ?? group.kind, ...group.parts.map((part) => PART_TEXT[part])].join(' · ')

const reasonText = (group: ReportGroup) =>
  REPORT_REASONS.filter((item) => (group.reasons[item.id] ?? 0) > 0)
    .map((item) => `${item.label} ${group.reasons[item.id]}`)
    .join(', ')

// 행은 지웠지만 사진 파일이 남았을 때의 안내. 행이 없어 다시 지울 수 없으므로 보관함에서 직접 지우게 한다.
const leftoverText = (group: ReportGroup, media: ReportedMedia) =>
  `${josa(KIND_TEXT[group.kind] ?? '대상', '은', '는')} 지웠지만 ${media.bucket === 'avatars' ? '프로필 사진' : '대표 사진'} 파일은 지우지 못했습니다. Supabase 보관함 ${media.bucket}에서 ${media.path} 파일을 직접 지워 주세요.`

type Pending = { group: ReportGroup; action: 'delete' | 'suspend' } | null

function ReportItem({ group, status, busy, onAction, onUnsuspend, onAsk }: { group: ReportGroup; status: ReportStatus; busy: boolean; onAction: (group: ReportGroup, action: ReportAction) => void; onUnsuspend: (group: ReportGroup) => void; onAsk: (pending: Pending, opener: HTMLElement) => void }) {
  const author = group.authorNickname || '(이름 없음)'
  // 글이면 그 글로, 사용자면 프로필로 간다. 글 주소에는 글쓴이가 들어가므로, 댓글은 (글쓴이를 몰라) 잇지 않는다.
  const link = group.kind === 'post' && group.postId ? toHash({ name: 'post', author: group.authorId, id: group.postId }) : group.kind === 'user' ? toHash({ name: 'profile', id: group.targetId }) : null
  const linkText = group.kind === 'post' ? '글 보기' : '프로필 보기'

  return (
    <li className="mod-report">
      <div className="mod-report__head">
        <span className="mod-tag">{targetText(group)}</span>
        {group.hidden && <span className="mod-tag mod-tag--strong">숨김</span>}
        {group.authorSuspended && <span className="mod-tag mod-tag--danger">글쓴이 정지</span>}
        <span className="mod-report__count">신고 {group.reportCount.toLocaleString('ko-KR')}건</span>
      </div>
      <p className="mod-report__preview">{group.preview || <span className="muted">(내용 없음)</span>}</p>
      <dl className="mod-report__meta">
        <div>
          <dt>글쓴이</dt>
          <dd>{author}</dd>
        </div>
        <div>
          <dt>사유</dt>
          <dd>{reasonText(group) || '-'}</dd>
        </div>
        <div>
          <dt>마지막 신고</dt>
          <dd>
            <time dateTime={group.lastAt ? new Date(group.lastAt).toISOString() : undefined}>{when(group.lastAt)}</time>
          </dd>
        </div>
      </dl>
      {group.details.length > 0 && (
        <div className="mod-report__details">
          <p className="mod-report__label">신고한 사람이 적은 내용</p>
          <ul>
            {group.details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mod-report__actions" role="group" aria-label={`${author}님의 ${targetText(group)} 처리`}>
        {link && (
          <a className="btn btn-ghost" href={link}>
            {linkText}
          </a>
        )}
        {status === 'open' &&
          (group.hidden ? (
            <button type="button" className="btn" disabled={busy} onClick={() => onAction(group, 'restore')}>
              다시 보이기
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => onAction(group, 'dismiss')}>
              문제없음
            </button>
          ))}
        {status === 'open' && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={(event) => onAsk({ group, action: 'delete' }, event.currentTarget)}>
            삭제
          </button>
        )}
        {group.authorSuspended ? (
          <button type="button" className="btn" disabled={busy} onClick={() => onUnsuspend(group)}>
            정지 풀기
          </button>
        ) : (
          status === 'open' && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={(event) => onAsk({ group, action: 'suspend' }, event.currentTarget)}>
              글쓴이 정지
            </button>
          )
        )}
      </div>
    </li>
  )
}

// 운영 화면의 "신고 처리": 같은 대상에 대한 신고를 하나로 묶어 보여 주고, 다시 보이기 · 삭제 · 정지 · 문제없음으로 닫는다.
export function ReportsSection() {
  const [status, setStatus] = useState<ReportStatus>('open')
  // null: 불러오는 중
  const [groups, setGroups] = useState<ReportGroup[] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // 지웠지만 남은 사진 파일 안내
  const [leftover, setLeftover] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const load = useCallback(async (which: ReportStatus) => {
    setGroups(null)
    setError('')
    try {
      const remote = await requireModeration()
      setGroups(await remote.reports(which))
    } catch (cause) {
      setGroups([])
      setError(moderationErrorText(cause))
    }
  }, [])

  useEffect(() => {
    void load(status)
  }, [load, status])

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    setLeftover('')
    try {
      await work()
      setMessage(done)
      await load(status)
      // 처리한 줄이 목록에서 사라지므로 초점을 섹션 제목으로 옮겨 둔다.
      heading.current?.focus()
    } catch (cause) {
      setError(moderationErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const act = (group: ReportGroup, action: ReportAction) =>
    run(
      async () => (await requireModeration()).resolve(group.kind, group.targetId, action),
      action === 'restore' ? '다시 보이게 했습니다.' : action === 'dismiss' ? '문제없음으로 닫았습니다.' : action === 'delete' ? '삭제했습니다.' : '글쓴이의 이용을 정지했습니다.',
    )

  const unsuspend = (group: ReportGroup) => run(async () => (await requireModeration()).unsuspend(group.authorId), `${group.authorNickname || '글쓴이'}님의 정지를 풀었습니다.`)

  const tab = (value: ReportStatus, label: string) => (
    <button type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>
      {label}
    </button>
  )

  const confirmed = pending
  return (
    <section className="admin-daily mod-admin" aria-labelledby="admin-reports-title">
      <div className="mod-admin__head">
        <h2 id="admin-reports-title" ref={heading} tabIndex={-1}>
          신고 처리
        </h2>
        <div className="seg" role="group" aria-label="신고 보기">
          {tab('open', '열린 신고')}
          {tab('closed', '닫힌 신고')}
        </div>
      </div>
      <p className="muted">같은 대상의 신고는 한 줄로 묶습니다. 서로 다른 세 사람이 신고하면 바로 숨겨집니다. “다시 보이기”는 숨김을 풀고 신고를 닫고, “문제없음”은 숨기지 않은 대상의 신고만 닫습니다.</p>
      {error && (
        <p className="mod-error" role="alert">
          {error}
        </p>
      )}
      {leftover && (
        <p className="mod-warn" role="alert">
          {leftover}
        </p>
      )}
      <p className="mod-status" role="status">
        {message}
      </p>
      {groups === null ? (
        <p className="muted">불러오는 중…</p>
      ) : groups.length === 0 ? (
        !error && <p className="muted">{status === 'open' ? '처리할 신고가 없습니다.' : '닫힌 신고가 없습니다.'}</p>
      ) : (
        <ul className="mod-reports">
          {groups.map((group) => (
            <ReportItem
              key={`${group.kind}:${group.targetId}`}
              group={group}
              status={status}
              busy={busy}
              onAction={(target, action) => void act(target, action)}
              onUnsuspend={(target) => void unsuspend(target)}
              onAsk={(next, from) => {
                opener.current = from
                setPending(next)
              }}
            />
          ))}
        </ul>
      )}

      {confirmed?.action === 'delete' && (
        <ConfirmDialog
          title={`이 ${josa(KIND_TEXT[confirmed.group.kind], '을', '를')} 삭제할까요?`}
          confirmLabel="삭제"
          busyLabel="삭제하는 중…"
          danger
          returnTo={opener}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            // 대표 사진 · 프로필 사진도 보관함에서 함께 지운다.
            setLeftover('')
            const result = await deleteReported(confirmed.group)
            setMessage('삭제했습니다.')
            if (result.leftover) setLeftover(leftoverText(confirmed.group, result.leftover))
            await load(status)
            heading.current?.focus()
          }}
        >
          {confirmed.group.kind === 'user' ? (
            // 서버(0014)는 계정을 지우지 않고 소개와 프로필 사진만 비운다.
            <p>이 사람의 소개와 프로필 사진을 지웁니다. 계정과 글은 그대로 남습니다. 되돌릴 수 없습니다.</p>
          ) : (
            <p>신고된 {josa(targetText(confirmed.group), '을', '를')} 지웁니다. 되돌릴 수 없습니다.</p>
          )}
          {confirmed.group.preview && <p className="mod-preview">{confirmed.group.preview}</p>}
        </ConfirmDialog>
      )}
      {confirmed?.action === 'suspend' && (
        <ConfirmDialog
          title={`${confirmed.group.authorNickname || '글쓴이'}님의 이용을 정지할까요?`}
          confirmLabel="정지"
          busyLabel="정지하는 중…"
          danger
          returnTo={opener}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await (await requireModeration()).resolve(confirmed.group.kind, confirmed.group.targetId, 'suspend')
            setMessage('글쓴이의 이용을 정지했습니다.')
            await load(status)
            heading.current?.focus()
          }}
        >
          <p>신고된 {josa(targetText(confirmed.group), '은', '는')} 숨겨지고, 이 사람은 글 · 댓글 · 팔로우 · 신고와 닉네임 · 소개 변경을 할 수 없습니다.</p>
          <p className="muted">정지는 이 화면에서 언제든 풀 수 있습니다.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

// 운영 화면의 "금칙어": 글 · 댓글 · 닉네임 · 소개에 들어 있으면 서버가 받지 않는 말.
export function BannedWordsSection() {
  // null: 불러오는 중
  const [words, setWords] = useState<string[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputId = useId()

  useEffect(() => {
    let cancelled = false
    requireModeration()
      .then((remote) => remote.bannedWords())
      .then((loaded) => {
        if (!cancelled) setWords(loaded)
      })
      .catch((cause) => {
        if (cancelled) return
        setWords([])
        setError(moderationErrorText(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const change = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      const remote = await requireModeration()
      setWords(await remote.bannedWords())
      return true
    } catch (cause) {
      setError(moderationErrorText(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const word = draft.trim()
    if (!word || busy) return
    if (await change(async () => (await requireModeration()).addBannedWord(word))) setDraft('')
  }

  return (
    <section className="admin-daily mod-admin" aria-labelledby="admin-words-title">
      <h2 id="admin-words-title">금칙어</h2>
      <p className="muted">글(제목 · 요약 · 본문) · 댓글 · 닉네임 · 소개에 이 말이 들어 있으면 서버가 받지 않습니다. 대소문자와 띄어쓰기 · 문장부호는 가리지 않고 비교합니다.</p>
      <form className="mod-words__form" onSubmit={(event) => void add(event)}>
        <label className="sr-only" htmlFor={inputId}>
          더할 금칙어
        </label>
        <input id={inputId} className="field" value={draft} maxLength={MODERATION_LIMITS.bannedWord} placeholder={`금칙어 (${MODERATION_LIMITS.bannedWord}자까지)`} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy}>
          더하기
        </button>
      </form>
      {error && (
        <p className="mod-error" role="alert">
          {error}
        </p>
      )}
      {words === null ? (
        <p className="muted">불러오는 중…</p>
      ) : words.length === 0 ? (
        !error && <p className="muted">금칙어가 없습니다.</p>
      ) : (
        <ul className="mod-words" aria-label={`금칙어 ${words.length}개`}>
          {words.map((word) => (
            <li key={word} className="mod-word">
              <span>{word}</span>
              <button type="button" className="mod-word__remove" aria-label={`${word} 빼기`} title="빼기" disabled={busy} onClick={() => void change(async () => (await requireModeration()).removeBannedWord(word))}>
                <XIcon size={14} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
