import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { IMAGE_MAX_BYTES } from '@highpress/core/db'
import { downloadBlob } from '../../lib/download'
import {
  clampRange,
  clipProblem,
  clipSeconds,
  DEFAULT_MARKER,
  defaultClip,
  formatTime,
  hasAudio,
  MARK_LIMITS,
  markAt,
  markerActive,
  OUTPUT_HEIGHTS,
  outputSeconds,
  RECORD_SPEEDS,
  recordMarkKey,
  removeMarkKey,
  setMarkKey,
  SPEEDS,
  VIDEO_ACCEPT,
  VIDEO_LIMITS,
  VIDEO_MIME_TYPES,
  type Clip,
  type Marker,
} from '@highpress/core/video'
import { ExportCancelled, exportGif, exportMp4, probeVideo, type Mp4Quality, type VideoInfo } from './videoExport'
import './video.css'

// 탭을 오가도 불러온 영상과 구간 설정이 남도록 상태는 바깥(EditorWorkspace)이 들고 있는다.
export interface VideoSession {
  file: File
  info: VideoInfo
  clip: Clip
  quality: Mp4Quality
  // 선수 강조 표시. 위치를 하나도 찍지 않았으면 없는 것과 같다.
  marker?: Marker
}

export interface VideoPaneProps {
  session: VideoSession | null
  onSession: (session: VideoSession | null) => void
  // 만든 GIF를 본문에 넣는다.
  onInsertFiles?: (files: File[]) => void
}

type Job = 'mp4' | 'gif' | 'insert'

const JOB_LABEL: Record<Job, string> = { mp4: 'MP4', gif: 'GIF', insert: 'GIF' }

// 찍은 위치가 이보다 많으면(재생하며 기록한 경우) 시각 단추를 늘어놓지 않는다.
const KEY_CHIPS = 24

function isVideoFile(file: File): boolean {
  return VIDEO_MIME_TYPES.includes(file.type) || /\.(mp4|mov|webm)$/i.test(file.name)
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || '영상'
}

export function VideoPane({ session, onSession, onInsertFiles }: VideoPaneProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const file = session?.file ?? null
  useEffect(() => {
    const video = videoRef.current
    if (!file || !video) return
    const url = URL.createObjectURL(file)
    video.src = url
    return () => {
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [file])

  // 화면을 떠나면 진행 중인 내보내기를 멈춘다.
  useEffect(() => () => abortRef.current?.abort(), [])

  const speed = session?.clip.speed ?? 1
  const muted = session ? !hasAudio(session.clip) : false
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = speed
    video.muted = muted
  }, [speed, muted, file])

  // ── 선수 강조 표시 ──
  const ringRef = useRef<HTMLSpanElement>(null)
  const spotRef = useRef<HTMLSpanElement>(null)
  const [marking, setMarking] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [now, setNow] = useState(0)
  // 누르고 있는 동안 재생하며 기록한다. 포인터 위치와 마지막으로 기록한 시각은 화면을 다시 그리지 않도록 ref 에 둔다.
  const [recording, setRecording] = useState(false)
  const [recordSpeed, setRecordSpeed] = useState<number>(0.5)
  const recordRef = useRef({ active: false, x: 0, y: 0, last: 0 })
  // 기록은 프레임마다 도는 함수 안에서 일어나므로 항상 최신 값을 보게 한다.
  const liveRef = useRef({ session, onSession })
  liveRef.current = { session, onSession }
  // 영상이 실제로 그려진 자리. 표시를 그 위에 정확히 겹친다.
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const keys = session?.marker?.keys
  const kind = session?.marker?.kind ?? 'ring'

  useEffect(() => {
    const video = videoRef.current
    if (!file || !video) return
    const measure = () => setBox({ left: video.offsetLeft, top: video.offsetTop, width: video.offsetWidth, height: video.offsetHeight })
    measure()
    // 크기 변화를 지켜볼 수 없는 환경에서는 처음 잰 자리를 쓴다.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(video)
    if (video.parentElement) observer.observe(video.parentElement)
    return () => observer.disconnect()
  }, [file, marking])

  // 재생 위치를 따라 표시를 옮긴다. 화면을 다시 그리지 않고 원의 자리만 바꾼다.
  useEffect(() => {
    const video = videoRef.current
    if (!file || !video) return
    let frame = 0
    let shown = -1
    const tick = () => {
      const t = video.currentTime
      // 누르고 있는 동안: 영상 시간이 일정 간격만큼 흐를 때마다 포인터 자리를 기록한다.
      const record = recordRef.current
      const live = liveRef.current
      if (record.active && live.session && t - record.last >= MARK_LIMITS.recordSeconds) {
        const marker = live.session.marker ?? DEFAULT_MARKER
        live.onSession({ ...live.session, marker: { ...marker, keys: recordMarkKey(marker.keys, record.last, { t, x: record.x, y: record.y }) } })
        record.last = t
      }
      const at = keys ? markAt(keys, t) : null
      const ring = ringRef.current
      if (ring) {
        ring.hidden = !at || kind !== 'ring'
        if (at) {
          ring.style.left = `${at.x * 100}%`
          ring.style.top = `${at.y * 100}%`
        }
      }
      const spot = spotRef.current
      if (spot) {
        spot.hidden = !at || kind !== 'spot'
        if (at) {
          spot.style.setProperty('--x', `${at.x * 100}%`)
          spot.style.setProperty('--y', `${at.y * 100}%`)
        }
      }
      if (Math.abs(t - shown) >= 0.05) {
        shown = t
        setNow(t)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [file, keys, kind])

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    setError('')
    setMessage('')
    if (!isVideoFile(picked)) {
      setError('mp4, mov, webm 영상만 불러올 수 있습니다.')
      return
    }
    if (picked.size > VIDEO_LIMITS.maxFileBytes) {
      setError('파일이 너무 큽니다 (2GB까지).')
      return
    }
    setLoading(true)
    try {
      const info = await probeVideo(picked)
      setMarking(false)
      onSession({ file: picked, info, clip: defaultClip(info.duration), quality: 720 })
    } catch {
      setError('이 영상을 읽지 못했습니다. 브라우저가 지원하지 않는 형식일 수 있습니다.')
    } finally {
      setLoading(false)
    }
  }

  const picker = (label: string) => (
    <label className="btn video-pick">
      {label}
      <input type="file" accept={VIDEO_ACCEPT} disabled={loading || job !== null} onChange={(event) => void pick(event)} />
    </label>
  )

  if (!session) {
    return (
      <div className="video-pane">
        <div className="video-empty">
          {picker(loading ? '영상을 읽는 중…' : '영상 파일 불러오기')}
          <p className="muted">mp4, mov, webm · 영상은 이 기기 안에서만 처리되고 어디에도 올라가지 않습니다.</p>
          <p className="muted">중계 영상 등 저작권이 있는 영상의 사용 책임은 사용자에게 있습니다.</p>
          {error && (
            <p className="video-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  const { info, clip, quality } = session
  const busy = job !== null
  const setClip = (patch: Partial<Clip>) => {
    const next = { ...clip, ...patch }
    // 배속에서는 재인코딩 없는 자르기를 쓸 수 없다.
    onSession({ ...session, clip: next, quality: next.speed !== 1 && quality === 'copy' ? 720 : quality })
  }
  const setRange = (start: number, end: number, moved: 'start' | 'end') => {
    const range = clampRange(start, end, info.duration, moved)
    setClip(range)
    const video = videoRef.current
    if (video) video.currentTime = moved === 'start' ? range.start : range.end
  }
  const currentTime = () => videoRef.current?.currentTime ?? 0

  const marker = session.marker ?? DEFAULT_MARKER
  const marked = markerActive(session.marker, clip)
  const setMarker = (patch: Partial<Marker>) => {
    const next = { ...marker, ...patch }
    // 표시가 들어가면 다시 인코딩해야 하므로 '원본 그대로'를 쓸 수 없다.
    onSession({ ...session, marker: next, quality: quality === 'copy' && markerActive(next, clip) ? 720 : quality })
  }
  const seek = (time: number) => {
    const video = videoRef.current
    if (video) video.currentTime = Math.min(info.duration, Math.max(0, time))
  }
  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => undefined)
    else video.pause()
  }
  const pointerAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }
  // 누르면 그 자리를 찍고 재생을 시작한다. 누른 채 선수를 따라가는 동안 위치가 계속 기록된다.
  const startRecord = (event: ReactPointerEvent<HTMLDivElement>) => {
    const video = videoRef.current
    const point = pointerAt(event)
    if (!video || !point) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const t = video.currentTime
    recordRef.current = { active: true, ...point, last: t }
    setMarker({ keys: setMarkKey(marker.keys, { t, ...point }) })
    setRecording(true)
    // 구간 끝에 닿아 있으면 더 재생할 것이 없다. 그 자리만 찍는다.
    if (t < clip.end - MARK_LIMITS.sameSeconds) {
      video.playbackRate = recordSpeed
      video.play().catch(() => undefined)
    }
  }
  const moveRecord = (event: ReactPointerEvent<HTMLDivElement>) => {
    const record = recordRef.current
    const point = pointerAt(event)
    if (!record.active || !point) return
    record.x = point.x
    record.y = point.y
    // 재생이 멈춰 있을 때 끌면(구간 끝 등) 지금 시각의 위치를 옮긴다.
    if (videoRef.current?.paused) setMarker({ keys: setMarkKey(marker.keys, { t: currentTime(), ...point }) })
  }
  // 손을 떼거나 재생이 멈추면 기록을 끝내고, 마지막 자리를 찍는다.
  const stopRecord = () => {
    const record = recordRef.current
    if (!record.active) return
    record.active = false
    setRecording(false)
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.playbackRate = clip.speed
    const t = video.currentTime
    if (t > record.last) setMarker({ keys: recordMarkKey(marker.keys, record.last, { t, x: record.x, y: record.y }) })
  }
  const keyHere = marker.keys.find((key) => Math.abs(key.t - now) <= MARK_LIMITS.sameSeconds)

  const playClip = () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = clip.start
    // 재생이 시작되기 전에 멈추면(내보내기 시작 등) 거절되는데, 알릴 일이 아니다.
    video.play().catch(() => undefined)
  }
  // 구간 끝에서 멈춘다.
  const onTimeUpdate = () => {
    const video = videoRef.current
    if (video && !video.paused && video.currentTime >= clip.end) {
      video.pause()
      video.currentTime = clip.end
    }
  }

  const run = async (kind: Job) => {
    const format = kind === 'mp4' ? 'mp4' : 'gif'
    setError('')
    setMessage('')
    const problem = clipProblem(clip, format)
    if (problem) {
      setError(problem)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setProgress(0)
    setJob(kind)
    videoRef.current?.pause()
    try {
      const options = { onProgress: setProgress, signal: controller.signal, marker: marked ? marker : undefined }
      const blob = format === 'mp4' ? await exportMp4(session.file, clip, quality, options) : await exportGif(session.file, clip, options)
      const name = `${baseName(session.file.name)}-편집.${format}`
      const size = `${(blob.size / 1024 / 1024).toFixed(1)}MB`
      if (kind !== 'insert') {
        downloadBlob(blob, name)
        setMessage(`${JOB_LABEL[kind]} 파일을 내려받았습니다 (${size}).`)
      } else if (blob.size > IMAGE_MAX_BYTES) {
        setError(`GIF가 ${size}라서 본문에 넣을 수 없습니다 (10MB까지). 구간을 줄여 주세요.`)
      } else {
        onInsertFiles?.([new File([blob], name, { type: 'image/gif' })])
        setMessage(`GIF를 본문에 넣었습니다 (${size}).`)
      }
    } catch (cause) {
      if (cause instanceof ExportCancelled) setMessage('내보내기를 취소했습니다.')
      else setError(`${JOB_LABEL[kind]}를 만들지 못했습니다. 다른 화질을 고르거나 구간을 줄여 다시 시도해 주세요.`)
    } finally {
      abortRef.current = null
      setJob(null)
    }
  }

  const gifProblem = clipProblem(clip, 'gif')
  const step = 0.1

  return (
    <div className="video-pane">
      <div className="video-row">
        <strong className="video-name" title={session.file.name}>
          {session.file.name}
        </strong>
        <span className="muted">
          {info.width}×{info.height} · {formatTime(info.duration)}
        </span>
        <span className="video-spacer" />
        {picker('다른 영상')}
        <button type="button" className="btn" disabled={busy} onClick={() => onSession(null)}>
          닫기
        </button>
      </div>

      <div className="video-stage">
        <video
          ref={videoRef}
          controls={!marking}
          playsInline
          preload="auto"
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false)
            // 기록하다가 구간 끝에 닿아 멈춘 경우.
            stopRecord()
          }}
          aria-label="영상 미리보기"
        />
        {/* 표시를 넣는 동안에만 누를 수 있다. 그 밖에는 영상의 조작 막대를 가리지 않는다. */}
        <div
          className="video-overlay"
          data-marking={marking || undefined}
          data-recording={recording || undefined}
          style={box}
          onPointerDown={(event) => {
            if (marking && !busy) startRecord(event)
          }}
          onPointerMove={moveRecord}
          onPointerUp={stopRecord}
          onPointerCancel={stopRecord}
        >
          <span ref={spotRef} className="video-spot" hidden style={{ '--r': `${marker.size * box.height}px` } as CSSProperties} />
          <span ref={ringRef} className="video-mark" hidden style={{ width: marker.size * box.height * 2, height: marker.size * box.height * 2, borderColor: marker.color }} />
        </div>
      </div>

      <div className="video-row" role="group" aria-label="선수 표시">
        <button type="button" className="chip" aria-pressed={marking} disabled={busy} onClick={() => setMarking(!marking)}>
          선수 표시 넣기
        </button>
        <span className="seg video-kind" role="group" aria-label="표시 모양">
          <button type="button" aria-pressed={kind === 'ring'} disabled={busy} onClick={() => setMarker({ kind: 'ring' })}>
            원
          </button>
          <button type="button" aria-pressed={kind === 'spot'} disabled={busy} onClick={() => setMarker({ kind: 'spot' })}>
            조명
          </button>
        </span>
        <label className="video-field">
          <span>크기</span>
          <input
            type="range"
            aria-label="표시 크기"
            min={MARK_LIMITS.minSize}
            max={MARK_LIMITS.maxSize}
            step={0.005}
            value={marker.size}
            disabled={busy}
            onChange={(event) => setMarker({ size: Number(event.target.value) })}
          />
        </label>
        <label className="video-field">
          <span>색</span>
          <input
            type="color"
            aria-label="표시 색"
            title={kind === 'spot' ? '조명에는 색이 없습니다' : undefined}
            value={marker.color}
            disabled={busy || kind === 'spot'}
            onChange={(event) => setMarker({ color: event.target.value })}
          />
        </label>
        <span className="muted video-summary">
          {marker.keys.length === 0
            ? kind === 'spot'
              ? '선수 주변만 밝게 두고 나머지를 어둡게 합니다. 위치는 직접 따라가며 기록합니다.'
              : '원으로 선수를 짚습니다. 위치는 직접 따라가며 기록합니다.'
            : `위치 ${marker.keys.length}곳 · ${formatTime(marker.keys[0].t)}부터 ${formatTime(marker.keys.length === 1 ? marker.keys[0].t + MARK_LIMITS.singleSeconds : marker.keys[marker.keys.length - 1].t)}까지 보입니다`}
        </span>
        <button type="button" className="btn" disabled={busy || marker.keys.length === 0} onClick={() => setMarker({ keys: [] })}>
          표시 모두 지우기
        </button>
      </div>

      {marking && (
        <div className="video-row video-marking">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={togglePlay}>
            {playing ? '멈춤' : '재생'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => seek(now - 0.1)}>
            −0.1초
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => seek(now + 0.1)}>
            +0.1초
          </button>
          <label className="video-range">
            <span>지금 {formatTime(now)}</span>
            <input type="range" aria-label="표시를 찍을 시각" min={clip.start} max={clip.end} step={0.05} value={Math.min(clip.end, Math.max(clip.start, now))} disabled={busy} onChange={(event) => seek(Number(event.target.value))} />
          </label>
          <label className="video-field">
            <span>기록 속도</span>
            <select className="field" aria-label="기록 속도" value={recordSpeed} disabled={busy || recording} onChange={(event) => setRecordSpeed(Number(event.target.value))}>
              {RECORD_SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}x{value === 0.5 ? ' (권장)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" disabled={busy || !keyHere} onClick={() => keyHere && setMarker({ keys: removeMarkKey(marker.keys, keyHere.t) })}>
            이 시각의 위치 지우기
          </button>
          <p className="muted video-marking__hint" role="status">
            {recording
              ? '기록하는 중입니다. 누른 채로 선수를 따라가세요. 손을 떼면 멈춥니다.'
              : '선수 위를 누르고 있으면 영상이 재생되며, 누른 채 따라가는 동안 위치가 계속 기록됩니다. 손을 떼면 멈추고, 다시 누르면 그 시각부터 이어집니다. 구간 끝까지 기록할 수 있고, 같은 구간을 다시 기록하면 새 움직임으로 바뀝니다.'}
          </p>
          {marker.keys.length > 0 && marker.keys.length <= KEY_CHIPS && (
            <div className="video-keys" role="group" aria-label="찍은 위치">
              {marker.keys.map((key) => (
                <button key={key.t} type="button" className="chip" aria-pressed={keyHere?.t === key.t} disabled={busy} onClick={() => seek(key.t)}>
                  {formatTime(key.t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="video-row">
        <label className="video-range">
          <span>시작 {formatTime(clip.start)}</span>
          <input
            type="range"
            aria-label="시작 지점"
            min={0}
            max={info.duration}
            step={step}
            value={clip.start}
            disabled={busy}
            onChange={(event) => setRange(Number(event.target.value), clip.end, 'start')}
          />
        </label>
        <button type="button" className="btn" disabled={busy} onClick={() => setRange(currentTime(), clip.end, 'start')}>
          지금 위치를 시작으로
        </button>
      </div>
      <div className="video-row">
        <label className="video-range">
          <span>끝 {formatTime(clip.end)}</span>
          <input
            type="range"
            aria-label="끝 지점"
            min={0}
            max={info.duration}
            step={step}
            value={clip.end}
            disabled={busy}
            onChange={(event) => setRange(clip.start, Number(event.target.value), 'end')}
          />
        </label>
        <button type="button" className="btn" disabled={busy} onClick={() => setRange(clip.start, currentTime(), 'end')}>
          지금 위치를 끝으로
        </button>
      </div>

      <div className="video-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={playClip}>
          구간 재생
        </button>
        <label className="video-field">
          <span>배속</span>
          <select
            className="field"
            aria-label="배속"
            value={clip.speed}
            disabled={busy}
            onChange={(event) => setClip({ speed: Number(event.target.value) })}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>
        <label className="video-field" title={clip.speed !== 1 ? '배속을 바꾸면 소리는 빠집니다' : undefined}>
          <input
            type="checkbox"
            checked={!hasAudio(clip)}
            disabled={busy || clip.speed !== 1}
            onChange={(event) => setClip({ muted: event.target.checked })}
          />
          <span>소리 제거</span>
        </label>
        <span className="muted video-summary">
          구간 {formatTime(clipSeconds(clip))} → 결과 {formatTime(outputSeconds(clip))}
          {clip.speed !== 1 && ' · 배속에서는 소리가 빠집니다'}
        </span>
      </div>

      <div className="video-row">
        <label className="video-field">
          <span>MP4 화질</span>
          <select
            className="field"
            aria-label="MP4 화질"
            value={quality}
            disabled={busy}
            onChange={(event) => onSession({ ...session, quality: event.target.value === 'copy' ? 'copy' : (Number(event.target.value) as Mp4Quality) })}
          >
            {OUTPUT_HEIGHTS.map((height) => (
              <option key={height} value={height}>
                {height}p{height === 720 ? ' (권장)' : height === 1080 ? ' (느림)' : ''}
              </option>
            ))}
            <option value="copy" disabled={clip.speed !== 1 || marked}>
              원본 그대로 (가장 빠름, 시작·끝이 몇 초 어긋날 수 있음)
            </option>
          </select>
        </label>
        <span className="video-spacer" />
        <button type="button" className="btn" disabled={busy} onClick={() => void run('mp4')}>
          MP4 내려받기
        </button>
        <button type="button" className="btn" disabled={busy} title={gifProblem ?? undefined} onClick={() => void run('gif')}>
          GIF 내려받기
        </button>
        {onInsertFiles && (
          <button type="button" className="btn btn-primary" disabled={busy} title={gifProblem ?? undefined} onClick={() => void run('insert')}>
            본문에 넣기 (GIF)
          </button>
        )}
      </div>

      {job && (
        <div className="video-row" role="status">
          <span>
            {JOB_LABEL[job]} 만드는 중… {Math.round(progress * 100)}%
          </span>
          <progress max={1} value={progress} />
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
            취소
          </button>
        </div>
      )}
      {message && !job && (
        <p className="video-note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="video-note video-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
