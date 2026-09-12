import { BrowserWindow, clipboard, desktopCapturer, ipcMain, Notification, screen } from 'electron'
import log from 'electron-log/main'
import path from 'path'
import { app } from 'electron'

let captureWindow: BrowserWindow | null = null
let capturedImage: Electron.NativeImage | null = null

interface CaptureRect {
  /** CSS pixels within the overlay window */
  x: number
  y: number
  width: number
  height: number
  /** devicePixelRatio of the overlay window, used to map to physical image pixels */
  dpr: number
}

export function registerCaptureHandlers(): void {
  ipcMain.handle('capture:start', () => {
    return startCapture()
  })

  ipcMain.handle('capture:get-image', () => {
    return capturedImage ? capturedImage.toDataURL() : null
  })

  ipcMain.handle('capture:confirm', (_event, rect: CaptureRect) => {
    confirmCapture(rect)
  })

  ipcMain.handle('capture:cancel', () => {
    closeCaptureWindow()
  })
}

/**
 * Capture the screen under the cursor at full resolution and open a fullscreen
 * overlay so the user can select a region; the selection is copied to the clipboard.
 */
export async function startCapture(): Promise<void> {
  if (captureWindow) {
    // Already capturing — focus the overlay instead of taking a second shot.
    captureWindow.focus()
    return
  }

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const scaleFactor = display.scaleFactor || 1

  let sources: Electron.DesktopCapturerSource[]
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scaleFactor),
        height: Math.round(display.size.height * scaleFactor),
      },
    })
  } catch (err) {
    log.error('[Capture] Failed to capture screen:', err)
    return
  }

  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    log.error('[Capture] No screen content available to capture')
    return
  }
  capturedImage = source.thumbnail

  captureWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      // The overlay only shows the pre-captured image and a selection rectangle;
      // no remote content is ever loaded here.
      webSecurity: true,
      preload: app.isPackaged
        ? path.join(__dirname, '../preload/index.js')
        : path.join(__dirname, '../../out/preload/index.js'),
    },
  })

  captureWindow.on('closed', () => {
    captureWindow = null
    // The overlay can be closed by the system (Alt+F4) without going through the
    // cancel IPC; release the pre-captured screenshot reference in that path too.
    capturedImage = null
  })

  try {
    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      await captureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/capture.html`)
    } else {
      await captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'))
    }
  } catch (err) {
    // Keep startCapture non-rejecting: its callers (the global shortcut callback and
    // the capture:start IPC handler) do not observe the promise. Clean up the half
    // created overlay so a retry can start fresh.
    log.error('[Capture] Failed to load the capture overlay:', err)
    closeCaptureWindow()
    return
  }

  captureWindow.show()
}

function confirmCapture(rect: CaptureRect): void {
  if (!capturedImage) {
    closeCaptureWindow()
    return
  }
  const dpr = rect.dpr || 1
  const cropRect = {
    x: Math.max(0, Math.round(rect.x * dpr)),
    y: Math.max(0, Math.round(rect.y * dpr)),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  }
  // Guard against rounding pushing the crop outside the source image.
  const size = capturedImage.getSize()
  cropRect.width = Math.min(cropRect.width, size.width - cropRect.x)
  cropRect.height = Math.min(cropRect.height, size.height - cropRect.y)
  if (cropRect.width <= 0 || cropRect.height <= 0) {
    closeCaptureWindow()
    return
  }

  try {
    const cropped = capturedImage.crop(cropRect)
    clipboard.writeImage(cropped)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Chatbox',
        body: 'Screenshot copied to clipboard',
        silent: true,
      }).show()
    }
  } catch (err) {
    log.error('[Capture] Failed to copy screenshot:', err)
  } finally {
    closeCaptureWindow()
  }
}

function closeCaptureWindow(): void {
  if (captureWindow) {
    captureWindow.destroy()
    captureWindow = null
  }
  capturedImage = null
}
