// Standalone vanilla-TS entry for the screenshot overlay window. It intentionally
// avoids React/i18n so the overlay opens instantly; the UI is icon-based and the
// whole flow talks to main over the shared electronAPI.invoke channel.

const screenshotEl = document.getElementById('screenshot') as HTMLImageElement
const dimEl = document.getElementById('dim') as HTMLDivElement
const selectionEl = document.getElementById('selection') as HTMLDivElement
const toolbarEl = document.getElementById('toolbar') as HTMLDivElement
const hintEl = document.getElementById('hint')
const confirmButton = document.getElementById('confirm') as HTMLButtonElement
const cancelButton = document.getElementById('cancel') as HTMLButtonElement

interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
  dpr: number
}

let currentRect: CaptureRect | null = null
let dragStart: { x: number; y: number } | null = null

const electronAPI = (
  window as unknown as { electronAPI: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }
).electronAPI

function applyDim() {
  if (!currentRect) return
  // Darken everything outside the selection with an oversized box-shadow.
  dimEl.style.boxShadow = '0 0 0 999999px rgba(0, 0, 0, 0.35)'
  selectionEl.style.left = `${currentRect.x}px`
  selectionEl.style.top = `${currentRect.y}px`
  selectionEl.style.width = `${currentRect.width}px`
  selectionEl.style.height = `${currentRect.height}px`
}

function resetSelection() {
  currentRect = null
  dragStart = null
  selectionEl.style.display = 'none'
  toolbarEl.style.display = 'none'
  dimEl.style.boxShadow = 'none'
}

async function init() {
  const dataUrl = (await electronAPI.invoke('capture:get-image')) as string | null
  if (!dataUrl) {
    window.close()
    return
  }
  screenshotEl.src = dataUrl
  if (hintEl) {
    const isZh = navigator.language.toLowerCase().startsWith('zh')
    hintEl.textContent = isZh ? '拖选区域截图，按 Esc 取消' : 'Drag to select a region · Esc to cancel'
  }
}

document.addEventListener('mousedown', (event) => {
  if (event.target === confirmButton || event.target === cancelButton) return
  dragStart = { x: event.clientX, y: event.clientY }
  currentRect = { x: event.clientX, y: event.clientY, width: 0, height: 0, dpr: window.devicePixelRatio || 1 }
  toolbarEl.style.display = 'none'
})

document.addEventListener('mousemove', (event) => {
  if (!dragStart || !currentRect) return
  const x = Math.min(dragStart.x, event.clientX)
  const y = Math.min(dragStart.y, event.clientY)
  const width = Math.abs(event.clientX - dragStart.x)
  const height = Math.abs(event.clientY - dragStart.y)
  currentRect = { x, y, width, height, dpr: window.devicePixelRatio || 1 }
  selectionEl.style.display = 'block'
  applyDim()
})

document.addEventListener('mouseup', () => {
  if (!currentRect) return
  dragStart = null
  if (currentRect.width < 4 || currentRect.height < 4) {
    resetSelection()
    return
  }
  // Show the action toolbar at the bottom-right corner of the selection.
  toolbarEl.style.display = 'flex'
  toolbarEl.style.left = `${currentRect.x + currentRect.width - 76}px`
  toolbarEl.style.top = `${currentRect.y + currentRect.height + 8}px`
})

confirmButton.addEventListener('click', () => {
  if (!currentRect) return
  void electronAPI.invoke('capture:confirm', currentRect)
})

cancelButton.addEventListener('click', () => {
  void electronAPI.invoke('capture:cancel')
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    void electronAPI.invoke('capture:cancel')
  }
})

void init()
