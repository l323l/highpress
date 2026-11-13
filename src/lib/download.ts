export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // 클릭 직후에 해제하면 일부 브라우저가 내려받기를 취소한다.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
