import type { Message } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelRunningToolCallBatch,
  type GenerationCancellationPersistence,
  stopGeneratingMessages,
} from './generation-cancellation'

describe('main generation cancellation', () => {
  it('persists every active step as stopped immediately when the user presses Stop', async () => {
    const persistedMessages = new Map<string, Message>()
    const persistence: GenerationCancellationPersistence = {
      removeMessage: (_sessionId, messageId) => {
        persistedMessages.delete(messageId)
        return Promise.resolve()
      },
      persistMessage: (_sessionId, message) => {
        persistedMessages.set(message.id, message)
        return Promise.resolve()
      },
    }
    const cancel = vi.fn()
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [
        { type: 'reasoning', text: 'Checking files', startTime: 15_000 },
        {
          type: 'tool-call',
          state: 'call',
          toolCallId: 'tool-search',
          toolName: 'search_files',
          args: { query: 'timer' },
          startTime: 16_000,
        },
        {
          type: 'tool-call',
          state: 'call',
          toolCallId: 'tool-read',
          toolName: 'read_file',
          args: { file_path: 'src/timer.ts' },
          startTime: 17_000,
        },
      ],
      generating: true,
      cancel,
      status: [{ type: 'sending_file' }],
    } as Message

    await stopGeneratingMessages('session-1', [message], persistence, 20_000)

    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(20_000)
    expect(persistedMessages.get(message.id)).toMatchObject({
      generating: false,
      cancel: undefined,
      status: [],
      finishReason: 'canceled',
      contentParts: [
        { type: 'reasoning', duration: 5_000 },
        {
          state: 'error',
          toolCallId: 'tool-search',
          duration: 4_000,
          result: { error: 'Tool execution stopped by user.', cancelled: true },
        },
        {
          state: 'error',
          toolCallId: 'tool-read',
          duration: 3_000,
          result: { error: 'Tool execution stopped by user.', cancelled: true },
        },
      ],
    })
  })

  it('removes an untouched assistant placeholder instead of persisting it', async () => {
    const persistedMessages = new Map<string, Message>()
    const removedMessageIds = new Set<string>()
    const persistence: GenerationCancellationPersistence = {
      removeMessage: (_sessionId, messageId) => {
        removedMessageIds.add(messageId)
        return Promise.resolve()
      },
      persistMessage: (_sessionId, message) => {
        persistedMessages.set(message.id, message)
        return Promise.resolve()
      },
    }
    const message = {
      id: 'message-empty',
      role: 'assistant',
      contentParts: [],
      generating: true,
      cancel: vi.fn(),
    } as Message

    await stopGeneratingMessages('session-1', [message], persistence, 20_000)

    expect(removedMessageIds).toContain(message.id)
    expect(persistedMessages.has(message.id)).toBe(false)
  })

  it('keeps completed tool results while stopping every active sibling', () => {
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [
        {
          type: 'tool-call',
          state: 'result',
          toolCallId: 'tool-completed',
          toolName: 'code_execution',
          result: { stdout: 'done', stderr: '', exitCode: 0 },
        },
        {
          type: 'tool-call',
          state: 'call',
          toolCallId: 'tool-command',
          toolName: 'code_execution',
          args: { code: 'while (true) {}' },
        },
        {
          type: 'tool-call',
          state: 'call',
          toolCallId: 'tool-other',
          toolName: 'read_file',
          args: { file_path: 'later.txt' },
        },
      ],
    } as Message

    const cancelled = cancelRunningToolCallBatch(message, new Set(['tool-completed', 'tool-command', 'tool-other']))

    expect(cancelled.contentParts).toMatchObject([
      {
        state: 'result',
        toolCallId: 'tool-completed',
        result: { stdout: 'done', stderr: '', exitCode: 0 },
      },
      {
        state: 'result',
        toolCallId: 'tool-command',
        result: { success: false, exitCode: 130, stdout: '', stderr: '', cancelled: true },
      },
      {
        state: 'error',
        toolCallId: 'tool-other',
        result: { error: 'Tool execution stopped by user.', cancelled: true },
      },
    ])
  })
})
