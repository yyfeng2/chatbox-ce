import { createMessage } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { isUserNavigationMessage } from './message-navigation-utils'

describe('isUserNavigationMessage', () => {
  it('includes human user prompts', () => {
    expect(isUserNavigationMessage(createMessage('user', 'hello'))).toBe(true)
  })

  it('excludes automated background-task callbacks', () => {
    expect(
      isUserNavigationMessage({
        ...createMessage('user', 'automated callback'),
        backgroundTask: {
          id: 'image-generation:record-1:done',
          type: 'image_generation',
          status: 'completed',
          recordId: 'record-1',
          startedAt: 1_000,
          finishedAt: 2_000,
          elapsedMs: 1_000,
          summary: 'One image generated.',
        },
      })
    ).toBe(false)
  })

  it('excludes summaries and non-user messages', () => {
    expect(isUserNavigationMessage({ ...createMessage('user', 'summary'), isSummary: true })).toBe(false)
    expect(isUserNavigationMessage(createMessage('assistant', 'response'))).toBe(false)
  })
})
