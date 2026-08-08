import type { BrowserWindow, Display } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllDisplays: vi.fn(),
  getDisplayMatching: vi.fn(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
}))

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: mocks.getAllDisplays,
    getDisplayMatching: mocks.getDisplayMatching,
  },
}))

vi.mock('./store-node', () => ({
  store: {
    get: mocks.storeGet,
    set: mocks.storeSet,
  },
}))

import { getState, saveState, WindowMode } from './window_state'

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
} as Display

describe('window state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAllDisplays.mockReturnValue([display])
    mocks.getDisplayMatching.mockReturnValue(display)
  })

  it('persists normal bounds while the window is maximized', () => {
    const window = {
      getNormalBounds: vi.fn(() => ({ x: 120, y: 80, width: 1280, height: 800 })),
      isFullScreen: vi.fn(() => false),
      isMaximized: vi.fn(() => true),
    } as unknown as BrowserWindow

    saveState(window)

    expect(mocks.storeSet).toHaveBeenCalledWith('windowState', {
      x: 120,
      y: 80,
      width: 1280,
      height: 800,
      mode: WindowMode.Maximized,
      normalBoundsVersion: 1,
    })
  })

  it('persists normal bounds while the window is fullscreen', () => {
    const window = {
      getNormalBounds: vi.fn(() => ({ x: 80, y: 60, width: 1100, height: 720 })),
      isFullScreen: vi.fn(() => true),
      isMaximized: vi.fn(() => false),
    } as unknown as BrowserWindow

    saveState(window)

    expect(mocks.storeSet).toHaveBeenCalledWith('windowState', {
      x: 80,
      y: 60,
      width: 1100,
      height: 720,
      mode: WindowMode.Fullscreen,
      normalBoundsVersion: 1,
    })
    expect(mocks.storeGet).not.toHaveBeenCalled()
  })

  it('repairs legacy maximized bounds that cover the work area', () => {
    mocks.storeGet.mockReturnValue({
      x: 0,
      y: 0,
      width: 1920,
      height: 1040,
      mode: WindowMode.Maximized,
    })

    expect(getState()[0]).toEqual({
      x: 448,
      y: 136,
      width: 1024,
      height: 768,
      mode: WindowMode.Maximized,
    })
  })

  it('keeps valid normal bounds for a maximized window', () => {
    const state = {
      x: 100,
      y: 80,
      width: 1280,
      height: 800,
      mode: WindowMode.Maximized,
    }
    mocks.storeGet.mockReturnValue(state)

    expect(getState()[0]).toEqual(state)
  })

  it('keeps versioned work-area-sized normal bounds for a maximized window', () => {
    const state = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1040,
      mode: WindowMode.Maximized,
      normalBoundsVersion: 1,
    }
    mocks.storeGet.mockReturnValue(state)

    expect(getState()[0]).toEqual(state)
  })

  it('does not repair a normal window that intentionally covers the work area', () => {
    const state = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1040,
      mode: WindowMode.Normal,
    }
    mocks.storeGet.mockReturnValue(state)

    expect(getState()[0]).toEqual(state)
  })
})
