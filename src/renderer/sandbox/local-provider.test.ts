import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock the platform module so we can observe how exec() delegates to sandboxExecCode.
const sandboxExecCode = vi.fn()
const sandboxStatus = vi.fn()
const sandboxSearch = vi.fn()
const sandboxInitTemp = vi.fn()
const sandboxReset = vi.fn()
vi.mock('@/platform', () => ({
  default: {
    get sandboxExecCode() {
      return sandboxExecCodeRef.current
    },
    get sandboxStatus() {
      return sandboxStatus
    },
    get sandboxSearch() {
      return sandboxSearchRef.current
    },
    sandboxInitTemp: (...args: unknown[]) => sandboxInitTemp(...args),
    sandboxReset: (...args: unknown[]) => sandboxReset(...args),
  },
}))

// Indirection so individual tests can toggle sandboxExecCode presence.
const sandboxExecCodeRef: { current: typeof sandboxExecCode | undefined } = { current: sandboxExecCode }
const sandboxSearchRef: { current: typeof sandboxSearch | undefined } = { current: sandboxSearch }

import { LocalSandboxProvider } from './local-provider'

beforeEach(() => {
  sandboxExecCode.mockReset()
  sandboxStatus.mockReset()
  sandboxSearch.mockReset()
  sandboxInitTemp.mockReset()
  sandboxReset.mockReset()
  sandboxExecCodeRef.current = sandboxExecCode
  sandboxSearchRef.current = sandboxSearch
})

describe('LocalSandboxProvider.init', () => {
  test('reuses an unchanged successful initialization and its accepted grants', async () => {
    sandboxInitTemp.mockResolvedValue({
      success: true,
      acceptedWorkingDirectories: [String.raw`C:\Users\me\project`],
    })
    const provider = new LocalSandboxProvider()
    provider.setExtraWritableDirs([String.raw`C:\Users\me\project`])

    await expect(Promise.all([provider.init('session-1'), provider.init('session-1')])).resolves.toEqual([
      { success: true, acceptedWorkingDirectories: [String.raw`C:\Users\me\project`] },
      { success: true },
    ])
    await expect(provider.init('session-1')).resolves.toEqual({ success: true })

    expect(sandboxInitTemp).toHaveBeenCalledTimes(1)
    expect(provider.getAcceptedExtraWritableDirs()).toEqual([String.raw`C:\Users\me\project`])
  })

  test('reinitializes when the session or requested grants change', async () => {
    sandboxInitTemp.mockResolvedValue({ success: true, acceptedWorkingDirectories: [] })
    const provider = new LocalSandboxProvider()

    await provider.init('session-1')
    provider.setExtraWritableDirs([String.raw`D:\workspace`])
    await provider.init('session-1')
    await provider.init('session-2')

    expect(sandboxInitTemp).toHaveBeenCalledTimes(3)
  })
})

describe('LocalSandboxProvider.search', () => {
  test('forwards structured search parameters to the shared main-process search', async () => {
    sandboxSearch.mockResolvedValue({ success: true, content: 'src/a.ts:1:match' })
    const provider = new LocalSandboxProvider()

    const result = await provider.search({ path: '.', pattern: String.raw`\d+?`, regex: true, include: '*.ts' })

    expect(sandboxSearch).toHaveBeenCalledWith({
      path: '.',
      pattern: String.raw`\d+?`,
      regex: true,
      include: '*.ts',
      sessionId: undefined,
    })
    expect(result).toEqual({ success: true, content: 'src/a.ts:1:match' })
  })

  test('returns a clear error when sandbox search is unavailable', async () => {
    sandboxSearchRef.current = undefined
    const provider = new LocalSandboxProvider()

    await expect(provider.search({ path: '.', pattern: 'x' })).resolves.toEqual({
      success: false,
      error: 'Sandbox search not available on this platform',
    })
  })
})

describe('LocalSandboxProvider.getStatus', () => {
  test('returns the host home directory before the sandbox is initialized', async () => {
    sandboxStatus.mockResolvedValue({
      state: 'idle',
      workingDirectory: null,
      platform: 'linux',
      homeDirectory: '/home/user',
    })
    const provider = new LocalSandboxProvider()

    await expect(provider.getStatus()).resolves.toEqual({
      initialized: false,
      sessionId: undefined,
      workingDirectory: null,
      homeDirectory: '/home/user',
    })
    expect(sandboxStatus).toHaveBeenCalledWith({ sessionId: undefined })
  })
})

describe('LocalSandboxProvider.exec', () => {
  test('forwards raw code/language to sandboxExecCode without any encoding', async () => {
    sandboxExecCode.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const provider = new LocalSandboxProvider()

    const code = "console.log('héllo');\nprocess.exit(0)"
    const result = await provider.exec({ code, language: 'node', timeout: 5_000, toolCallId: 'tool-call-1' })

    expect(sandboxExecCode).toHaveBeenCalledTimes(1)
    const arg = sandboxExecCode.mock.calls[0][0]
    // Code is passed verbatim — no base64, no shell wrapping.
    expect(arg.code).toBe(code)
    expect(arg.language).toBe('node')
    expect(arg.timeout).toBe(5_000)
    expect(arg.toolCallId).toBe('tool-call-1')
    expect(result).toEqual({ stdout: 'ok', stderr: '', exitCode: 0 })
  })

  test('returns an error result when the platform has no sandbox executor', async () => {
    sandboxExecCodeRef.current = undefined
    const provider = new LocalSandboxProvider()

    const result = await provider.exec({ code: 'echo hi', language: 'bash' })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Sandbox not available')
  })
})
