import type { Message, Session } from '@shared/types'
import { describe, expect, test } from 'vitest'
import { assertNoMessageDataUpdate, getSessionMetadataSnapshot, mergeCachedGeneratingMessages } from './chatStore-cache'

function message(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? 'message-id',
    role: overrides.role ?? 'assistant',
    contentParts: overrides.contentParts ?? [],
    ...overrides,
  }
}

function session(overrides: Partial<Session>): Session {
  return {
    id: overrides.id ?? 'session-id',
    name: overrides.name ?? 'Session',
    messages: overrides.messages ?? [],
    ...overrides,
  }
}

describe('mergeCachedGeneratingMessages', () => {
  test('preserves cached preparing status for a generating message', () => {
    const persisted = session({
      messages: [
        message({
          id: 'assistant-1',
          generating: true,
          status: [],
        }),
      ],
      settings: {
        provider: 'openai',
        modelId: 'gpt-4.1',
      },
    })
    const cached = session({
      messages: [
        message({
          id: 'assistant-1',
          generating: true,
          status: [{ type: 'preparing_tool_call', toolName: 'code_execution' }],
        }),
      ],
    })

    const result = mergeCachedGeneratingMessages(persisted, cached)

    expect(result.settings?.modelId).toBe('gpt-4.1')
    expect(result.messages[0].status).toEqual([{ type: 'preparing_tool_call', toolName: 'code_execution' }])
  })

  test('does not restore cached state for completed messages', () => {
    const persisted = session({
      messages: [
        message({
          id: 'assistant-1',
          generating: false,
          status: [],
        }),
      ],
    })
    const cached = session({
      messages: [
        message({
          id: 'assistant-1',
          generating: true,
          status: [{ type: 'preparing_tool_call', toolName: 'code_execution' }],
        }),
      ],
    })

    const result = mergeCachedGeneratingMessages(persisted, cached)

    expect(result.messages[0].status).toEqual([])
  })

  test('preserves concurrent generating state inside saved fork branches', () => {
    const persistedCandidate = message({
      id: 'assistant-fork',
      generating: true,
      status: [],
    })
    const cachedCandidate = message({
      id: 'assistant-fork',
      generating: true,
      cancel: () => {},
      status: [{ type: 'preparing_tool_call', toolName: 'code_execution' }],
    })
    const persisted = session({
      messages: [message({ id: 'user-1', role: 'user' }), message({ id: 'assistant-current' })],
      messageForksHash: {
        'user-1': {
          position: 0,
          lists: [
            { id: 'current', messages: [] },
            { id: 'candidate', messages: [persistedCandidate] },
          ],
          createdAt: 1,
        },
      },
    })
    const cached = session({
      messages: persisted.messages,
      messageForksHash: {
        'user-1': {
          position: 0,
          lists: [
            { id: 'current', messages: [] },
            { id: 'candidate', messages: [cachedCandidate] },
          ],
          createdAt: 1,
        },
      },
    })

    const result = mergeCachedGeneratingMessages(persisted, cached)
    const candidate = result.messageForksHash?.['user-1'].lists[1].messages[0]

    expect(candidate?.cancel).toBe(cachedCandidate.cancel)
    expect(candidate?.status).toEqual([{ type: 'preparing_tool_call', toolName: 'code_execution' }])
  })
})

describe('session metadata update helpers', () => {
  test('returns a snapshot without message-owned fields', () => {
    const result = getSessionMetadataSnapshot(
      session({
        messages: [message({ id: 'message-1' })],
        threads: [
          {
            id: 'thread-1',
            name: 'Thread',
            messages: [message({ id: 'thread-message-1' })],
            createdAt: 1,
          },
        ],
        messageForksHash: {
          'message-1': {
            position: 0,
            lists: [{ id: 'fork-1', messages: [message({ id: 'fork-message-1' })] }],
            createdAt: 1,
          },
        },
        compactionPoints: [{ summaryMessageId: 'summary-1', boundaryMessageId: 'message-1', createdAt: 1 }],
        settings: {
          provider: 'openai',
          modelId: 'gpt-4.1',
        },
      })
    )

    expect(result).toEqual({
      id: 'session-id',
      name: 'Session',
      settings: {
        provider: 'openai',
        modelId: 'gpt-4.1',
      },
    })
  })

  test('rejects message-owned fields in metadata updates', () => {
    expect(() => assertNoMessageDataUpdate({ settings: { modelId: 'gpt-4.1' } })).not.toThrow()
    expect(() => assertNoMessageDataUpdate({ messages: [] })).toThrow(
      'updateSession cannot update "messages". Use updateSessionWithMessages for message data.'
    )
    expect(() => assertNoMessageDataUpdate({ threads: [] })).toThrow(
      'updateSession cannot update "threads". Use updateSessionWithMessages for message data.'
    )
    expect(() => assertNoMessageDataUpdate({ messageForksHash: {} })).toThrow(
      'updateSession cannot update "messageForksHash". Use updateSessionWithMessages for message data.'
    )
    expect(() => assertNoMessageDataUpdate({ compactionPoints: [] })).toThrow(
      'updateSession cannot update "compactionPoints". Use updateSessionWithMessages for message data.'
    )
  })
})
