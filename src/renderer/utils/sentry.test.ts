import { beforeEach, describe, expect, test, vi } from 'vitest'
import { reportError } from './sentry'

const { captureException, setExtra, setTag } = vi.hoisted(() => ({
  captureException: vi.fn(),
  setExtra: vi.fn(),
  setTag: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
  captureException,
  withScope: (callback: (scope: { setExtra: typeof setExtra; setTag: typeof setTag }) => void) =>
    callback({ setExtra, setTag }),
}))

describe('reportError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('adds stable classification and bounded context', () => {
    const error = new Error('boom')

    reportError(error, {
      domain: 'session',
      extras: { retryCount: 2 },
      handled: false,
      operation: 'generation',
      priority: 'high',
      tags: { provider: 'openai' },
    })

    expect(captureException).toHaveBeenCalledWith(error)
    expect(setTag).toHaveBeenCalledWith('error_domain', 'session')
    expect(setTag).toHaveBeenCalledWith('error_operation', 'generation')
    expect(setTag).toHaveBeenCalledWith('error_priority', 'high')
    expect(setTag).toHaveBeenCalledWith('error_handled', 'false')
    expect(setTag).toHaveBeenCalledWith('provider', 'openai')
    expect(setExtra).toHaveBeenCalledWith('retryCount', 2)
  })

  test('normalizes non-Error values', () => {
    reportError('failed', { domain: 'application', operation: 'startup' })

    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'failed' }))
  })
})
