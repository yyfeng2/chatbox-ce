// @vitest-environment jsdom

import { ChatboxAIAPIError, OCRError } from '@shared/models/errors'
import type { Message, Session, SessionSettings, Settings } from '@shared/types'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { reportErrorMock, trackEventMock } = vi.hoisted(() => ({
  reportErrorMock: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
vi.mock('@/utils/track', () => ({ trackEvent: trackEventMock }))
vi.mock('@/utils/sentry', () => ({ reportError: reportErrorMock }))
vi.mock('@/packages/model-setting-utils', () => ({ getModelDisplayName: vi.fn() }))
vi.mock('../chatStore', () => ({
  useSession: vi.fn(() => ({ session: null })),
}))

import { uiStore } from '../uiStore'
import { getCompactionPointsForTarget, handleGenerationError, trackGenerateEvent } from './utils'

describe('trackGenerateEvent', () => {
  beforeEach(() => {
    trackEventMock.mockClear()
    reportErrorMock.mockClear()
    uiStore.setState({ sessionAgentModeMap: {} })
  })

  test('uses persisted session settings instead of the transient UI map', () => {
    const settings = {
      provider: 'openai',
      modelId: 'gpt-4.1',
      agentMode: { value: 'on', locked: true, lockReason: 'message_sent' },
    } satisfies SessionSettings

    trackGenerateEvent('session-1', settings, {} as Settings, 'chat')

    expect(trackEventMock).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({
        agent_mode: 'on',
        agent_mode_active: 'true',
        agent_mode_entry_source: 'locked_session',
      })
    )
  })

  test('does not report expected Chatbox API errors as high-priority failures', () => {
    const error = ChatboxAIAPIError.fromCodeName('quota', 'token_quota_exhausted')
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [],
    } as Message
    const settings = {
      modelId: 'chatboxai-4',
      provider: 'chatboxai',
    } as SessionSettings

    const result = handleGenerationError(error, message, settings, { operationType: 'send_message' })

    expect(reportErrorMock).not.toHaveBeenCalled()
    expect(result.errorCode).toBe(10004)
  })

  test('persists Chatbox AI OCR quota exhaustion separately from main-model quota exhaustion', () => {
    const cause = ChatboxAIAPIError.fromCodeName('quota', 'token_quota_exhausted')
    expect(cause).not.toBeNull()
    if (!cause) throw new Error('Expected a known Chatbox AI quota error')
    const error = new OCRError('Chatbox AI', cause)
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [],
      aiProvider: 'deepseek',
      model: 'DeepSeek API (DeepSeek V4 Pro)',
    } as Message
    const settings = {
      modelId: 'deepseek-v4-pro',
      provider: 'deepseek',
    } as SessionSettings

    const result = handleGenerationError(error, message, settings, { operationType: 'send_message' })

    expect(result.errorCode).toBe(20041)
    expect(result.errorExtra).toMatchObject({
      aiProvider: 'Chatbox AI',
      causeErrorCode: 10004,
    })
  })

  test('preserves the daily-free scope when Chatbox AI OCR exhausts quota', () => {
    const cause = ChatboxAIAPIError.fromCodeName('daily quota', 'free_token_quota_exhausted')
    expect(cause).not.toBeNull()
    if (!cause) throw new Error('Expected a known Chatbox AI free quota error')
    const error = new OCRError('Chatbox AI', cause)
    const message = {
      id: 'message-1',
      role: 'assistant',
      contentParts: [],
    } as Message
    const settings = {
      modelId: 'deepseek-v4-pro',
      provider: 'deepseek',
    } as SessionSettings

    const result = handleGenerationError(error, message, settings, { operationType: 'send_message' })

    expect(result.errorCode).toBe(20042)
    expect(result.errorExtra).toMatchObject({
      aiProvider: 'Chatbox AI',
      causeErrorCode: 20039,
    })
  })
})

describe('getCompactionPointsForTarget', () => {
  const sessionPoint = { summaryMessageId: 'active-summary', boundaryMessageId: 'active-a1', createdAt: 2000 }
  const threadPoint = { summaryMessageId: 'thread-summary', boundaryMessageId: 'thread-a1', createdAt: 1000 }

  function makeSessionWithThread(): Session {
    const msg = (id: string, overrides: Partial<Message> = {}): Message => ({
      id,
      role: 'assistant',
      contentParts: [],
      ...overrides,
    })
    return {
      id: 'session-1',
      name: 'Test',
      messages: [msg('active-u1', { role: 'user' }), msg('active-a1'), msg('active-summary', { isSummary: true })],
      compactionPoints: [sessionPoint],
      threads: [
        {
          id: 'thread-1',
          name: 'archived',
          createdAt: 500,
          messages: [msg('thread-u1', { role: 'user' }), msg('thread-a1'), msg('thread-summary', { isSummary: true })],
          compactionPoints: [threadPoint],
        },
      ],
      messageForksHash: {
        'thread-u1': {
          position: 0,
          createdAt: 1,
          lists: [
            { id: 'list-0', messages: [] },
            { id: 'list-1', messages: [msg('thread-fork-alt')] },
          ],
        },
      },
    }
  }

  test('uses session points for active-conversation messages', () => {
    expect(getCompactionPointsForTarget(makeSessionWithThread(), 'active-a1')).toEqual([sessionPoint])
  })

  test('uses the archived thread points when retrying from a thread', () => {
    expect(getCompactionPointsForTarget(makeSessionWithThread(), 'thread-a1')).toEqual([threadPoint])
  })

  test('uses the thread points for fork branches reachable from the thread', () => {
    expect(getCompactionPointsForTarget(makeSessionWithThread(), 'thread-fork-alt')).toEqual([threadPoint])
  })

  test('falls back to session points for unknown messages', () => {
    expect(getCompactionPointsForTarget(makeSessionWithThread(), 'missing')).toEqual([sessionPoint])
  })
})
