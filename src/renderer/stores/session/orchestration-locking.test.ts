import type { Message } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { wakeBackgroundTaskFollowUpsMock, withSessionGenerationLockMock } = vi.hoisted(() => {
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
  }
})

vi.mock('@/packages/chatbox-cli/background-follow-up', () => ({
  wakeBackgroundTaskFollowUps: wakeBackgroundTaskFollowUpsMock,
}))
vi.mock('./generation-lock', () => ({
  withSessionGenerationLock: withSessionGenerationLockMock,
}))
vi.mock('../chatStore', () => ({}))

import {
  applyPersistentToolCallPause,
  continuePausedToolCall,
  createPausedToolCallExecutionContext,
  finishPausedToolCallContinuation,
  retryFromLastToolCallAfterApiError,
  stopPausedToolCall,
} from './orchestration'
import { createInitialState } from './stream-chunk-processor'

const approvalDetails = {
  type: 'image_generation' as const,
  provider: 'chatbox-ai',
  modelId: 'image-model',
  prompt: 'first image',
  count: 1,
  billing: 'chatbox_quota' as const,
}

describe('paused tool-call generation entry-point locking', () => {
  beforeEach(() => {
    wakeBackgroundTaskFollowUpsMock.mockClear()
    withSessionGenerationLockMock.mockClear()
  })

  it.each([
    ['approval denial', stopPausedToolCall],
    ['approval continuation', continuePausedToolCall],
    ['API retry', retryFromLastToolCallAfterApiError],
  ])('serializes %s with other generation work', async (_name, run) => {
    await run('session-1', 'message-1', 'tool-1')

    expect(withSessionGenerationLockMock).toHaveBeenCalledOnce()
    expect(withSessionGenerationLockMock).toHaveBeenCalledWith('session-1', expect.any(Function))
  })

})

describe('paused tool-call approval binding', () => {
  it('forwards the continuation abort signal to the resumed tool', () => {
    const controller = new AbortController()
    const context = createPausedToolCallExecutionContext(
      {
        toolCallId: 'tool-1',
        pauseReason: { type: 'user_exec_approval', command: 'sleep 30' },
      },
      'tool-1',
      controller.signal
    )

    expect(context).toMatchObject({ toolCallId: 'tool-1', approved: true, abortSignal: controller.signal })
  })

  it('authorizes only the tool call explicitly approved by the user', () => {
    const selected = createPausedToolCallExecutionContext(
      {
        toolCallId: 'tool-1',
        pauseReason: {
          type: 'app_action_approval',
          action: 'image.generate',
          title: 'Generate image',
          preview: 'first image',
          details: approvalDetails,
        },
      },
      'tool-1'
    )
    const sibling = createPausedToolCallExecutionContext(
      {
        toolCallId: 'tool-2',
        pauseReason: {
          type: 'app_action_approval',
          action: 'image.generate',
          title: 'Generate image',
          preview: 'second image',
          details: { ...approvalDetails, prompt: 'second image' },
        },
      },
      'tool-1'
    )

    expect(selected).toEqual({ toolCallId: 'tool-1', approved: true, approvalDetails })
    expect(sibling).toEqual({ toolCallId: 'tool-2', approved: false, approvalDetails: undefined })
  })

  it('does not authorize calls resumed from a tool-call-limit pause', () => {
    expect(
      createPausedToolCallExecutionContext(
        {
          toolCallId: 'tool-1',
          pauseReason: { type: 'tool_call_limit', maxToolCalls: 25 },
        },
        undefined
      )
    ).toEqual({ toolCallId: 'tool-1', approved: false, approvalDetails: undefined })
  })
})

describe('paused tool-call continuation cancellation', () => {
  it('clears runtime generation controls when continuation stops', () => {
    const cancel = vi.fn()
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [],
      generating: true,
      cancel,
      finishReason: 'tool-call-paused',
    } as Message

    expect(finishPausedToolCallContinuation(message, 'canceled')).toMatchObject({
      generating: false,
      cancel: undefined,
      finishReason: 'canceled',
    })
  })
})

describe('parallel approval message ownership', () => {
  it('keeps both approvals in the original assistant message with independent details', () => {
    const state = createInitialState([
      {
        type: 'tool-call',
        state: 'call',
        toolCallId: 'tool-1',
        toolName: 'chatbox_cli',
        args: { argv: ['image', 'generate', '--prompt', 'first image'] },
        stepIndex: 0,
      },
      {
        type: 'tool-call',
        state: 'call',
        toolCallId: 'tool-2',
        toolName: 'chatbox_cli',
        args: { argv: ['image', 'generate', '--prompt', 'second image'] },
        stepIndex: 0,
      },
    ])

    const firstPaused = applyPersistentToolCallPause(state, {
      name: 'AppActionApprovalPausedError',
      toolCallId: 'tool-1',
      action: 'image.generate',
      title: 'Generate image',
      preview: 'first image',
      details: { ...approvalDetails, prompt: 'first image' },
    })
    const bothPaused = applyPersistentToolCallPause(firstPaused, {
      name: 'AppActionApprovalPausedError',
      toolCallId: 'tool-2',
      action: 'image.generate',
      title: 'Generate image',
      preview: 'second image',
      details: { ...approvalDetails, prompt: 'second image' },
    })

    expect(bothPaused.contentParts).toMatchObject([
      {
        type: 'tool-call',
        state: 'paused',
        toolCallId: 'tool-1',
        pauseReason: {
          type: 'app_action_approval',
          details: { type: 'image_generation', prompt: 'first image' },
        },
      },
      {
        type: 'tool-call',
        state: 'paused',
        toolCallId: 'tool-2',
        pauseReason: {
          type: 'app_action_approval',
          details: { type: 'image_generation', prompt: 'second image' },
        },
      },
    ])
  })
})
