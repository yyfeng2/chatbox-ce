import { describe, expect, it } from 'vitest'
import { shouldShowConcurrentReplyStop } from './message-action-state'

describe('message action state', () => {
  it('shows per-message stop only for opted-in alternative replies during concurrency', () => {
    const baseOptions = {
      allowStop: true,
      cancellable: true,
      sessionType: 'chat' as const,
    }

    expect(shouldShowConcurrentReplyStop({ ...baseOptions, generatingReplyCount: 1 })).toBe(false)
    expect(shouldShowConcurrentReplyStop({ ...baseOptions, generatingReplyCount: 2 })).toBe(true)
    expect(
      shouldShowConcurrentReplyStop({
        ...baseOptions,
        cancellable: false,
        generatingReplyCount: 2,
      })
    ).toBe(false)
    expect(
      shouldShowConcurrentReplyStop({
        ...baseOptions,
        generatingReplyCount: 2,
        sessionType: 'picture',
      })
    ).toBe(false)
  })

  it('never shows stop on messages that did not opt in (current reply in the main list)', () => {
    expect(
      shouldShowConcurrentReplyStop({
        allowStop: false,
        cancellable: true,
        generatingReplyCount: 2,
        sessionType: 'chat',
      })
    ).toBe(false)
  })
})
