import { zipSync, type Zippable } from 'fflate'
import { getMediaBlob } from '../../db/store'
import type { ExportFile } from './exportDocument'

export interface ExportEntry {
  name: string
  blob: Blob
}

// 파일을 읽지 못한 항목은 빠진다. 호출한 쪽이 개수를 비교해 안내한다.
export async function loadExportEntries(files: ExportFile[]): Promise<ExportEntry[]> {
  const entries: ExportEntry[] = []
  for (const file of files) {
    const blob = await getMediaBlob(file.mediaId)
    if (blob) entries.push({ name: file.name, blob })
  }
  return entries
}

export async function buildZip(entries: ExportEntry[]): Promise<Blob> {
  const data: Zippable = {}
  for (const entry of entries) {
    // 이미지는 이미 압축돼 있으므로 다시 압축하지 않는다.
    data[entry.name] = [new Uint8Array(await entry.blob.arrayBuffer()), { level: 0 }]
  }
  return new Blob([zipSync(data)], { type: 'application/zip' })
}

// File System Access API (Chrome·Edge). 표준 DOM 타입에 없어 필요한 부분만 적는다.
type DirectoryPicker = (options?: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>
const directoryPicker = (): DirectoryPicker | undefined =>
  (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

export function canSaveToFolder(): boolean {
  return typeof directoryPicker() === 'function'
}

// 사용자가 고른 폴더에 파일을 쓴다. 폴더 선택을 취소하면 null.
export async function saveToFolder(entries: ExportEntry[]): Promise<number | null> {
  let folder: FileSystemDirectoryHandle
  try {
    folder = await directoryPicker()!.call(window, { mode: 'readwrite' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
  for (const entry of entries) {
    const handle = await folder.getFileHandle(entry.name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(entry.blob)
    await writable.close()
  }
  return entries.length
}
