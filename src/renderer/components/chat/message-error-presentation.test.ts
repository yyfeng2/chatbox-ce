import type { Message } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { isMessageReminderPresentation, resolveMessageErrorPresentation } from './message-error-presentation'

function message(overrides: Partial<Message>): Message {
  return {
    id: 'assistant-error',
    role: 'assistant',
    contentParts: [],
    error: 'request failed',
    ...overrides,
  } as Message
}

describe('resolveMessageErrorPresentation', () => {
  it.each([
    [10004, 'quota-exhausted'],
    [20039, 'free-quota-exhausted'],
    [20040, 'agent-mode-reward'],
    [20041, 'ocr-quota-exhausted'],
    [20042, 'free-ocr-quota-exhausted'],
  ] as const)('maps client error code %s to %s', (errorCode, expected) => {
    expect(resolveMessageErrorPresentation(message({ errorCode }))).toBe(expected)
  })

  it('keeps unrelated failures in the generic error presentation', () => {
    const presentation = resolveMessageErrorPresentation(message({ errorCode: 10002 }))

    expect(presentation).toBe('generic-error')
    expect(isMessageReminderPresentation(presentation)).toBe(false)
  })
})
