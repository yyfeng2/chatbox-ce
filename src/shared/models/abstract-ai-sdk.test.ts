import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { Provider } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelDependencies } from '../types/adapters'
import type { SentryScope } from '../utils/sentry_adapter'
import AbstractAISDKModel, { isRetryableStatusError } from './abstract-ai-sdk'
import { ApiError, MidStreamApiError } from './errors'
import type { CallChatCompletionOptions } from './types'

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: aiMocks.streamText,
  }
})

const languageModel: LanguageModelV3 = {
  specificationVersion: 'v3',
  provider: 'test',
  modelId: 'test-model',
  supportedUrls: {},
  doGenerate: vi.fn(),
  doStream: vi.fn(),
}

class TestModel extends AbstractAISDKModel {
  protected getProvider(
    _options: CallChatCompletionOptions
  ): Pick<Provider, 'languageModel'> & Partial<Pick<Provider, 'embeddingModel' | 'imageModel'>> {
    return {
      languageModel: () => languageModel,
    }
  }

  protected getChatModel(_options: CallChatCompletionOptions): LanguageModelV3 {
    return languageModel
  }
}

function createDependencies(): ModelDependencies {
  return {
    request: {
      apiRequest: vi.fn(),
      fetchWithOptions: vi.fn(),
    },
    storage: {
      saveImage: vi.fn(),
      getImage: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn((callback: (scope: SentryScope) => void) =>
        callback({
          setTag: vi.fn(),
          setExtra: vi.fn(),
        })
      ),
    },
    getRemoteConfig: vi.fn(() => ({})),
  }
}

function createModel(modelId = 'test-model'): TestModel {
  return new TestModel(
    {
      model: {
        modelId,
        type: 'chat',
        capabilities: ['tool_use'],
      },
    },
    createDependencies()
  )
}

describe('AbstractAISDKModel tool errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an error tool-call part with provider metadata when no call chunk preceded the error', async () => {
    const providerMetadata = { google: { thoughtSignature: 'signature-1' } }
    aiMocks.streamText.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'tool-error',
          toolCallId: 'tc1',
          toolName: 'code_execution',
          input: '{"code":"console.log(1)",',
          error: new Error('Invalid JSON'),
          providerMetadata,
          providerExecuted: true,
          dynamic: true,
        }
      })(),
      totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      finishReason: Promise.resolve('stop'),
    })

    const result = await createModel().chat([], {})

    expect(result.contentParts).toHaveLength(1)
    expect(result.contentParts[0]).toMatchObject({
      type: 'tool-call',
      state: 'error',
      toolCallId: 'tc1',
      toolName: 'code_execution',
      args: '{"code":"console.log(1)",',
      providerMetadata,
      providerExecuted: true,
      result: {
        error: {
          name: 'Error',
          message: 'Invalid JSON',
        },
        input: '{"code":"console.log(1)",',
        toolName: 'code_execution',
      },
    })
  })

  it('stores error metadata on the result side when the call part already exists', async () => {
    const callMetadata = { google: { thoughtSignature: 'signature-1' } }
    const errorMetadata = { google: { errorDetail: 'detail-1' } }
    aiMocks.streamText.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'code_execution',
          input: { code: 'throw new Error()' },
          providerMetadata: callMetadata,
          providerExecuted: true,
          dynamic: true,
        }
        yield {
          type: 'tool-error',
          toolCallId: 'tc1',
          toolName: 'code_execution',
          input: { code: 'throw new Error()' },
          error: new Error('Execution failed'),
          providerMetadata: errorMetadata,
          providerExecuted: true,
          dynamic: true,
        }
      })(),
      totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      finishReason: Promise.resolve('stop'),
    })

    const result = await createModel().chat([], {})

    expect(result.contentParts[0]).toMatchObject({
      type: 'tool-call',
      state: 'error',
      providerMetadata: callMetadata,
      resultProviderMetadata: errorMetadata,
    })
  })
})

describe('AbstractAISDKModel completed response normalization', () => {
  it('applies model-specific normalization independently of the transport provider', () => {
    const model = createModel('deepseek/deepseek-v4-pro')
    const parts = [{ type: 'reasoning' as const, text: 'Recovered answer' }]

    expect(model.normalizeCompletedResponse(parts, 'stop')).toEqual([{ type: 'text', text: 'Recovered answer' }])
  })

  it('normalizes the completed direct chat result and its final callback update', async () => {
    const onResultChange = vi.fn()
    aiMocks.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: 'reasoning-delta', text: 'Recovered answer' }
      })(),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
      finishReason: Promise.resolve('stop'),
    })

    const result = await createModel('deepseek/deepseek-v4-pro').chat([], { onResultChange })

    expect(result).toMatchObject({
      contentParts: [{ type: 'text', text: 'Recovered answer' }],
      finishReason: 'stop',
    })
    expect(onResultChange).toHaveBeenLastCalledWith({
      contentParts: [{ type: 'text', text: 'Recovered answer' }],
      tokenCount: 20,
      tokensUsed: 30,
    })
  })
})

describe('AbstractAISDKModel chatStream closure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes the underlying provider stream when the consumer closes chatStream early', async () => {
    // Consumers close chatStream early on Stop drains and chunk-processing failures;
    // that closure must propagate to the SDK stream so provider/tool work stops too.
    let providerStreamClosed = false
    aiMocks.streamText.mockReturnValue({
      fullStream: (async function* () {
        try {
          yield { type: 'text-delta', id: 't1', text: 'hello' }
          yield { type: 'text-delta', id: 't1', text: ' world' }
          yield { type: 'finish', finishReason: 'stop' }
        } finally {
          providerStreamClosed = true
        }
      })(),
      totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      finishReason: Promise.resolve('stop'),
    })

    const stream = createModel().chatStream([], {})
    const first = await stream.next()
    expect(first.done).toBe(false)

    await stream.return(undefined)
    expect(providerStreamClosed).toBe(true)
  })
})

describe('isRetryableStatusError', () => {
  it('never retries MidStreamApiError regardless of status code', () => {
    expect(isRetryableStatusError(new MidStreamApiError('shutdown', '{"error":{}}', 503))).toBe(false)
    expect(isRetryableStatusError(new MidStreamApiError('rate limited', undefined, 429))).toBe(false)
  })

  it('retries plain ApiError with retryable status codes', () => {
    expect(isRetryableStatusError(new ApiError('unavailable', undefined, 503))).toBe(true)
    expect(isRetryableStatusError(new ApiError('rate limited', undefined, 429))).toBe(true)
    expect(isRetryableStatusError(new ApiError('bad request', undefined, 400))).toBe(false)
    expect(isRetryableStatusError(new ApiError('no status'))).toBe(false)
  })

  it('retries plain objects with a retryable statusCode', () => {
    expect(isRetryableStatusError({ statusCode: 502 })).toBe(true)
    expect(isRetryableStatusError({ statusCode: 401 })).toBe(false)
    expect(isRetryableStatusError(new Error('nope'))).toBe(false)
  })
})
