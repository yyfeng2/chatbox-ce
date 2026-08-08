import type { Session } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { wakeBackgroundTaskFollowUpsMock, withSessionGenerationLockMock, updateSessionMock, trackPauseActionMock } =
  vi.hoisted(() => {
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    }
    ;(globalThis as unknown as { localStorage: typeof storage }).localStorage = storage
    ;(globalThis as unknown as { window: { localStorage: typeof storage } }).window = { localStorage: storage }
    return {
      wakeBackgroundTaskFollowUpsMock: vi.fn(),
      withSessionGenerationLockMock: vi.fn(() => Promise.resolve()),
      updateSessionMock: vi.fn(),
      trackPauseActionMock: vi.fn(),
    }
  })

vi.mock('@/packages/chatbox-cli/background-follow-up', () => ({
  wakeBackgroundTaskFollowUps: wakeBackgroundTaskFollowUpsMock,
}))
vi.mock('./generation-lock', () => ({
  withSessionGenerationLock: withSessionGenerationLockMock,
}))
vi.mock('../chatStore', () => ({
  updateSession: updateSessionMock,
}))
vi.mock('@/analytics/agent-mode', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/analytics/agent-mode')>()
  return { ...original, trackAgentModePauseAction: trackPauseActionMock }
})

import { settingsStore } from '../settingsStore'
import { disableToolCallLimitPauseAndContinue } from './orchestration'

function mockPersistedSession(session: Partial<Session>) {
  updateSessionMock.mockImplementation(async (_sessionId: string, updater: (s: Partial<Session>) => Session) =>
    updater(session)
  )
}

async function lastUpdatedSession(): Promise<Session> {
  return await updateSessionMock.mock.results[updateSessionMock.mock.results.length - 1].value
}

describe('disableToolCallLimitPauseAndContinue', () => {
  beforeEach(() => {
    wakeBackgroundTaskFollowUpsMock.mockClear()
    withSessionGenerationLockMock.mockClear()
    updateSessionMock.mockReset()
    trackPauseActionMock.mockClear()
    settingsStore.setState({ pauseOnToolCallLimit: true })
  })

  afterEach(() => {
    settingsStore.setState({ pauseOnToolCallLimit: true })
  })

  it('persists the session-level opt-out without touching the global setting', async () => {
    mockPersistedSession({ id: 'session-1', name: 'demo', settings: { provider: 'p', temperature: 0.3 } })

    await disableToolCallLimitPauseAndContinue('session-1', 'message-1', 'tool-1', 'session')

    expect(updateSessionMock).toHaveBeenCalledOnce()
    const updated = await lastUpdatedSession()
    expect(updated.settings).toEqual({ provider: 'p', temperature: 0.3, pauseOnToolCallLimit: false })
    expect(settingsStore.getState().pauseOnToolCallLimit).toBe(true)
  })

  it("persists the global opt-out and drops this session's override so it follows the global value", async () => {
    mockPersistedSession({
      id: 'session-1',
      name: 'demo',
      settings: { provider: 'p', temperature: 0.3, pauseOnToolCallLimit: true },
    })

    await disableToolCallLimitPauseAndContinue('session-1', 'message-1', 'tool-1', 'global')

    expect(settingsStore.getState().pauseOnToolCallLimit).toBe(false)
    const updated = await lastUpdatedSession()
    expect(updated.settings).toEqual({ provider: 'p', temperature: 0.3 })
  })

  it('tracks a single pause action and resumes the paused batch under the generation lock', async () => {
    mockPersistedSession({ id: 'session-1', name: 'demo', settings: {} })

    await disableToolCallLimitPauseAndContinue('session-1', 'message-1', 'tool-1', 'session')

    expect(trackPauseActionMock).toHaveBeenCalledOnce()
    expect(trackPauseActionMock).toHaveBeenCalledWith({ type: 'tool_limit', action: 'disable_session' })
    expect(withSessionGenerationLockMock).toHaveBeenCalledOnce()
    expect(withSessionGenerationLockMock).toHaveBeenCalledWith('session-1', expect.any(Function))
  })

  it('still resumes the paused batch when persisting the preference fails', async () => {
    updateSessionMock.mockRejectedValue(new Error('storage failed'))

    await expect(disableToolCallLimitPauseAndContinue('session-1', 'message-1', 'tool-1', 'session')).rejects.toThrow(
      'storage failed'
    )

    expect(withSessionGenerationLockMock).toHaveBeenCalledOnce()
  })
})
