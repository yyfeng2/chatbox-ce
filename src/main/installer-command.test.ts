import { describe, expect, it } from 'vitest'
import { getQuitAndInstallArguments, isQuitForInstallRequested, QUIT_FOR_INSTALL_ARGUMENT } from './installer-command'

describe('isQuitForInstallRequested', () => {
  it('recognizes the installer quit argument', () => {
    expect(isQuitForInstallRequested(['Chatbox.exe', QUIT_FOR_INSTALL_ARGUMENT])).toBe(true)
  })

  it('does not treat normal launches or deep links as installer quit requests', () => {
    expect(isQuitForInstallRequested(['Chatbox.exe'])).toBe(false)
    expect(isQuitForInstallRequested(['Chatbox.exe', 'chatbox://settings'])).toBe(false)
  })
})

describe('getQuitAndInstallArguments', () => {
  it('enables silent installation and relaunch on Windows', () => {
    expect(getQuitAndInstallArguments('win32')).toEqual([true, true])
  })

  it.each(['darwin', 'linux'] satisfies NodeJS.Platform[])(
    'preserves the default updater behavior on %s',
    (platform) => {
      expect(getQuitAndInstallArguments(platform)).toEqual([])
    }
  )
})
