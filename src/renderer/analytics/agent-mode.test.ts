import {
  AIProviderNoImplementedPaintError,
  ApiError,
  BaseError,
  ChatboxAIAPIError,
  NetworkError,
  OCRError,
} from '@shared/models/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureExceptionMock = vi.fn()
const setTagMock = vi.fn()

vi.mock('@sentry/react', () => ({
  withScope: (callback: (scope: { setTag: (key: string, value: string) => void }) => void) =>
    callback({ setTag: setTagMock }),
  captureException: (error: unknown) => captureExceptionMock(error),
}))

vi.mock('@/utils/track', () => ({
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/utils/track'
import {
  bucketCount,
  captureAgentModeException,
  isExpectedGenerationError,
  toBooleanString,
  trackAgentModeSuggested,
} from './agent-mode'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toBooleanString', () => {
  it('maps booleans to string literals', () => {
    expect(toBooleanString(true)).toBe('true')
    expect(toBooleanString(false)).toBe('false')
  })
})

describe('bucketCount', () => {
  it('buckets counts at the 0/1/2+ boundaries', () => {
    expect(bucketCount(-1)).toBe('0')
    expect(bucketCount(0)).toBe('0')
    expect(bucketCount(1)).toBe('1')
    expect(bucketCount(2)).toBe('2_plus')
    expect(bucketCount(100)).toBe('2_plus')
  })
})

describe('trackAgentModeSuggested', () => {
  it('sends bucketed props only', () => {
    trackAgentModeSuggested({ hasFiles: true, fileCount: 3 })
    expect(trackEvent).toHaveBeenCalledWith('agent_mode_suggested', {
      has_files: 'true',
      file_count: '2_plus',
    })
  })
})

describe('isExpectedGenerationError', () => {
  it('treats provider/network errors as expected', () => {
    expect(isExpectedGenerationError(new ApiError('rate limited'))).toBe(true)
    expect(isExpectedGenerationError(new NetworkError('offline', 'https://example.com'))).toBe(true)
    expect(isExpectedGenerationError(ChatboxAIAPIError.fromCodeName('quota', 'token_quota_exhausted'))).toBe(true)
    expect(isExpectedGenerationError(new AIProviderNoImplementedPaintError('openai'))).toBe(true)
    expect(isExpectedGenerationError(new OCRError('builtin', new BaseError('bad image')))).toBe(true)
  })

  it('treats other errors as unexpected', () => {
    expect(isExpectedGenerationError(new Error('boom'))).toBe(false)
    expect(isExpectedGenerationError(new OCRError('builtin', new Error('bad image')))).toBe(false)
    expect(isExpectedGenerationError('string error')).toBe(false)
  })
})

describe('captureAgentModeException', () => {
  it('skips expected provider errors', () => {
    captureAgentModeException(new ApiError('rate limited'), { operation: 'suggestion' })
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })

  it('captures unexpected errors with tags', () => {
    const error = new Error('boom')
    captureAgentModeException(error, {
      operation: 'generation',
      provider: 'openai',
      model: 'gpt-4o',
      agentMode: 'on',
      fullAccess: true,
    })
    expect(captureExceptionMock).toHaveBeenCalledWith(error)
    expect(setTagMock).toHaveBeenCalledWith('component', 'agent-mode')
    expect(setTagMock).toHaveBeenCalledWith('provider', 'openai')
    expect(setTagMock).toHaveBeenCalledWith('model', 'gpt-4o')
    expect(setTagMock).toHaveBeenCalledWith('full_access', 'true')
  })

  it('wraps non-Error values so Sentry gets a real exception', () => {
    captureAgentModeException('string failure', { operation: 'tool_retry' })
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const captured = captureExceptionMock.mock.calls[0][0]
    expect(captured).toBeInstanceOf(Error)
    expect(captured.message).toBe('string failure')
  })

  it('sanitizes custom-provider identifiers and drops user-typed model ids', () => {
    captureAgentModeException(new Error('boom'), {
      operation: 'generation',
      provider: 'custom-provider-3f1c9a2e',
      model: 'my-private-model',
    })
    expect(setTagMock).toHaveBeenCalledWith('provider', 'custom')
    expect(setTagMock).not.toHaveBeenCalledWith('model', expect.anything())
  })

  it('strips user-entered MCP server names from tool_name tags', () => {
    captureAgentModeException(new Error('boom'), {
      operation: 'tool_pause_continue',
      toolName: 'mcp__my_company_server__search_docs',
    })
    expect(setTagMock).toHaveBeenCalledWith('tool_name', 'mcp__search_docs')
  })

  it('keeps builtin tool names as-is', () => {
    captureAgentModeException(new Error('boom'), {
      operation: 'tool_retry',
      toolName: 'write_file',
    })
    expect(setTagMock).toHaveBeenCalledWith('tool_name', 'write_file')
  })
})
