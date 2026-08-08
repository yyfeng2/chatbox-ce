/**
 * Env-gated integration tests for provider-specific thinking controls.
 *
 * API keys use provider names without a TEST_ prefix:
 * OPENAI_API_KEY=...
 * OPENAI_API_HOST=...      optional, defaults to https://api.openai.com
 * CLAUDE_API_KEY=...
 * CLAUDE_API_HOST=...      optional, defaults to https://api.anthropic.com/v1
 * GEMINI_API_KEY=...
 * DEEPSEEK_API_KEY=...
 * QWEN_API_KEY=...
 * XAI_API_KEY=...
 * OPENROUTER_API_KEY=...
 * CHATBOX_LICENSE_KEY=...
 *
 * Run:
 * pnpm test:model-provider -- reasoning-control.test.ts
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import type { ModelMessage } from 'ai'
import dotenv from 'dotenv'
import { describe, expect, it } from 'vitest'
import TestPlatform from '../../../src/renderer/platform/test_platform'
import { settings as getDefaultSettings, newConfigs, SystemProviders } from '../../../src/shared/defaults'
import { getModel } from '../../../src/shared/providers'
import {
  type ModelProvider,
  ModelProviderEnum,
  type ProviderModelInfo,
  type ProviderOptions,
  type SessionSettings,
  type Settings,
} from '../../../src/shared/types'
import {
  getReasoningControlCapabilities,
  getReasoningProviderOptions,
  type ReasoningControlLevel,
} from '../../../src/shared/utils/reasoning-control'
import { createMockModelDependencies } from '../mocks/model-dependencies'
import { MockSentryAdapter } from '../mocks/sentry'

function loadEnvFiles() {
  let originalEnvPath: string | undefined
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim()
    const originalWorktree = gitCommonDir.endsWith('.git') ? path.dirname(gitCommonDir) : undefined
    if (originalWorktree && originalWorktree !== process.cwd()) {
      originalEnvPath = path.join(originalWorktree, '.env')
    }
  } catch {
    // Ignore; cwd env files below are still enough for local runs.
  }
  if (originalEnvPath) {
    dotenv.config({ path: originalEnvPath, override: true })
  }
  for (const envPath of ['.env', '.env.local']) {
    dotenv.config({ path: envPath })
  }
}

loadEnvFiles()

interface ThinkingCallCase {
  name: string
  provider: ModelProvider
  apiKeyEnv: string
  apiHostEnv?: string
  modelId: string
  apiStyle?: ProviderModelInfo['apiStyle']
  level: ReasoningControlLevel
  expectedProviderOptions: ProviderOptions
  maxTokens: number
  temperature?: number
  topP?: number
  expectedSamplingParameters?: 'included' | 'omitted'
  prompt?: string
  expectReasoning?: boolean
  expectNoReasoning?: boolean
  skipProviderCallReason?: string
}

const REASONING_PROMPT =
  'Solve this briefly but correctly: A snail climbs a 10 meter wall. Each day it climbs 3 meters and each night it slips 2 meters. On which day does it reach the top?'

const CALL_CASES: ThinkingCallCase[] = [
  {
    name: 'OpenAI Responses gpt-5.5 off maps to reasoningEffort none',
    provider: ModelProviderEnum.OpenAIResponses,
    apiKeyEnv: 'OPENAI_API_KEY',
    apiHostEnv: 'OPENAI_API_HOST',
    modelId: 'gpt-5.5',
    level: 'off',
    expectedProviderOptions: { openai: { reasoningEffort: 'none', forceReasoning: true } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'OpenAI Responses gpt-5.5 low maps to reasoningEffort low and summary auto',
    provider: ModelProviderEnum.OpenAIResponses,
    apiKeyEnv: 'OPENAI_API_KEY',
    apiHostEnv: 'OPENAI_API_HOST',
    modelId: 'gpt-5.5',
    level: 'low',
    expectedProviderOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
  },
  {
    name: 'Claude Haiku 4.5 off disables thinking budget',
    provider: ModelProviderEnum.Claude,
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiHostEnv: 'CLAUDE_API_HOST',
    modelId: 'claude-haiku-4-5-20251001',
    level: 'off',
    expectedProviderOptions: { claude: { thinking: { type: 'disabled', budgetTokens: 0 } } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'Claude Haiku 4.5 low enables thinking budget',
    provider: ModelProviderEnum.Claude,
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiHostEnv: 'CLAUDE_API_HOST',
    modelId: 'claude-haiku-4-5-20251001',
    level: 'low',
    expectedProviderOptions: { claude: { thinking: { type: 'enabled', budgetTokens: 1024 } } },
    maxTokens: 4096,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'Claude Sonnet 4.6 low enables thinking budget',
    provider: ModelProviderEnum.Claude,
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiHostEnv: 'CLAUDE_API_HOST',
    modelId: 'claude-sonnet-4-6',
    level: 'low',
    expectedProviderOptions: { claude: { thinking: { type: 'enabled', budgetTokens: 1024 } } },
    maxTokens: 4096,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'Claude Opus 4.7 low maps to adaptive effort',
    provider: ModelProviderEnum.Claude,
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiHostEnv: 'CLAUDE_API_HOST',
    modelId: 'claude-opus-4-7',
    level: 'low',
    expectedProviderOptions: { claude: { effort: 'low' } },
    maxTokens: 1024,
  },
  {
    name: 'Claude Opus 4.8 low maps to adaptive effort',
    provider: ModelProviderEnum.Claude,
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiHostEnv: 'CLAUDE_API_HOST',
    modelId: 'claude-opus-4-8',
    level: 'low',
    expectedProviderOptions: { claude: { effort: 'low' } },
    maxTokens: 1024,
  },
  {
    name: 'Gemini 2.5 Flash off disables returned thoughts',
    provider: ModelProviderEnum.Gemini,
    apiKeyEnv: 'GEMINI_API_KEY',
    modelId: 'gemini-2.5-flash',
    level: 'off',
    expectedProviderOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'Gemini 2.5 Flash low maps to thinkingBudget',
    provider: ModelProviderEnum.Gemini,
    apiKeyEnv: 'GEMINI_API_KEY',
    modelId: 'gemini-2.5-flash',
    level: 'low',
    expectedProviderOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'Gemini 3 Pro low maps to thinkingLevel',
    provider: ModelProviderEnum.Gemini,
    apiKeyEnv: 'GEMINI_API_KEY',
    modelId: 'gemini-3-pro-preview',
    level: 'low',
    expectedProviderOptions: { google: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: true } } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
    skipProviderCallReason: 'Gemini 3 preview availability varies by key/host; mapping is covered here.',
  },
  {
    name: 'DeepSeek V4 Flash off disables thinking',
    provider: ModelProviderEnum.DeepSeek,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelId: 'deepseek-v4-flash',
    level: 'off',
    expectedProviderOptions: { deepseek: { thinking: { type: 'disabled' } } },
    maxTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
    expectedSamplingParameters: 'included',
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'DeepSeek V4 Flash high enables max thinking effort',
    provider: ModelProviderEnum.DeepSeek,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelId: 'deepseek-v4-flash',
    level: 'high',
    expectedProviderOptions: { deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'max' } },
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    expectedSamplingParameters: 'omitted',
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'DeepSeek V4 Pro off disables thinking',
    provider: ModelProviderEnum.DeepSeek,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelId: 'deepseek-v4-pro',
    level: 'off',
    expectedProviderOptions: { deepseek: { thinking: { type: 'disabled' } } },
    maxTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
    expectedSamplingParameters: 'included',
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'DeepSeek V4 Pro high enables max thinking effort',
    provider: ModelProviderEnum.DeepSeek,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelId: 'deepseek-v4-pro',
    level: 'high',
    expectedProviderOptions: { deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'max' } },
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    expectedSamplingParameters: 'omitted',
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'Qwen qwen3.7 off disables thinking',
    provider: ModelProviderEnum.Qwen,
    apiKeyEnv: 'QWEN_API_KEY',
    modelId: 'qwen3.7-max',
    level: 'off',
    expectedProviderOptions: { openaiCompatible: { enable_thinking: false } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'Qwen qwen3.7 low maps to thinking_budget',
    provider: ModelProviderEnum.Qwen,
    apiKeyEnv: 'QWEN_API_KEY',
    modelId: 'qwen3.7-max',
    level: 'low',
    expectedProviderOptions: { openaiCompatible: { enable_thinking: true, thinking_budget: 1024 } },
    maxTokens: 2048,
  },
  {
    name: 'xAI Grok 4.3 off maps to reasoningEffort none',
    provider: ModelProviderEnum.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    modelId: 'grok-4.3',
    level: 'off',
    expectedProviderOptions: { openai: { reasoningEffort: 'none', forceReasoning: true } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'xAI Grok 4.3 low maps to reasoningEffort low',
    provider: ModelProviderEnum.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    modelId: 'grok-4.3',
    level: 'low',
    expectedProviderOptions: {
      openai: {
        reasoningEffort: 'low',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'xAI Grok 4 alias low maps to reasoningEffort low',
    provider: ModelProviderEnum.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    modelId: 'grok-4',
    level: 'low',
    expectedProviderOptions: {
      openai: {
        reasoningEffort: 'low',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'xAI Grok 4.1 fast alias low maps to reasoningEffort low',
    provider: ModelProviderEnum.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    modelId: 'grok-4-1-fast',
    level: 'low',
    expectedProviderOptions: {
      openai: {
        reasoningEffort: 'low',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'xAI Grok 4 fast alias low maps to reasoningEffort low',
    provider: ModelProviderEnum.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    modelId: 'grok-4-fast',
    level: 'low',
    expectedProviderOptions: {
      openai: {
        reasoningEffort: 'low',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'OpenRouter Claude Sonnet 4.6 off disables reasoning',
    provider: ModelProviderEnum.OpenRouter,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelId: 'anthropic/claude-sonnet-4.6',
    level: 'off',
    expectedProviderOptions: { openrouter: { reasoning: { enabled: false, exclude: true } } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'OpenRouter Claude Sonnet 4.6 low maps to OpenRouter reasoning',
    provider: ModelProviderEnum.OpenRouter,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelId: 'anthropic/claude-sonnet-4.6',
    level: 'low',
    expectedProviderOptions: { openrouter: { reasoning: { effort: 'low', exclude: false } } },
    maxTokens: 4096,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'OpenRouter DeepSeek R1 medium maps to OpenRouter reasoning',
    provider: ModelProviderEnum.OpenRouter,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelId: 'deepseek/deepseek-r1-0528',
    level: 'medium',
    expectedProviderOptions: { openrouter: { reasoning: { effort: 'medium', exclude: false } } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
    skipProviderCallReason: 'OpenRouter DeepSeek R1 routing is consistently slow; request mapping is covered here.',
  },
  {
    name: 'ChatboxAI Claude Sonnet 4.6 thinking low maps to Anthropic gateway thinking',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'claude-sonnet-4.6-thinking',
    apiStyle: 'anthropic',
    level: 'low',
    expectedProviderOptions: { claude: { thinking: { type: 'enabled', budgetTokens: 1024 } } },
    maxTokens: 4096,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'ChatboxAI Gemini 2.5 Flash low maps to Google gateway thinking',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'gemini-2.5-flash',
    apiStyle: 'google',
    level: 'low',
    expectedProviderOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
  {
    name: 'ChatboxAI GPT 5.5 low maps to OpenAI-compatible gateway reasoning',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'gpt-5.5',
    apiStyle: 'openai',
    level: 'low',
    expectedProviderOptions: { openai: { reasoningEffort: 'low' } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
  },
  {
    // Regression: reasoning "off" writes forceReasoning alongside reasoningEffort.
    // The OpenAI-compatible gateway path used to forward it verbatim and most
    // gateway upstreams reject it (400 "Unknown parameter: 'forceReasoning'").
    name: 'ChatboxAI GPT 5.5 off keeps chat completions usable without gateway-only flags',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'gpt-5.5',
    apiStyle: 'openai',
    level: 'off',
    expectedProviderOptions: { openai: { reasoningEffort: 'none', forceReasoning: true } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
  },
  {
    name: 'ChatboxAI DeepSeek V4 Pro off maps to Anthropic gateway thinking disable',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'deepseek-v4-pro',
    apiStyle: 'anthropic',
    level: 'off',
    expectedProviderOptions: { claude: { thinking: { type: 'disabled' } } },
    maxTokens: 1024,
    prompt: REASONING_PROMPT,
    expectNoReasoning: true,
  },
  {
    name: 'ChatboxAI DeepSeek V4 Pro high maps to Anthropic gateway max effort',
    provider: ModelProviderEnum.ChatboxAI,
    apiKeyEnv: 'CHATBOX_LICENSE_KEY',
    modelId: 'deepseek-v4-pro',
    apiStyle: 'anthropic',
    level: 'high',
    expectedProviderOptions: { claude: { thinking: { type: 'enabled' }, effort: 'max' } },
    maxTokens: 2048,
    prompt: REASONING_PROMPT,
    expectReasoning: true,
  },
]

function getActiveCases(): Array<ThinkingCallCase & { apiKey: string; apiHost?: string }> {
  return CALL_CASES.filter((testCase) => !!process.env[testCase.apiKeyEnv]).map((testCase) => ({
    ...testCase,
    apiKey: process.env[testCase.apiKeyEnv] || '',
    apiHost: testCase.apiHostEnv ? process.env[testCase.apiHostEnv] : undefined,
  }))
}

function createModelInfo(modelId: string, apiStyle?: ProviderModelInfo['apiStyle']): ProviderModelInfo {
  return {
    modelId,
    apiStyle,
  }
}

function createGlobalSettings(
  provider: ModelProvider,
  apiKey: string,
  modelInfo: ProviderModelInfo,
  apiHost?: string
): Settings {
  const systemProvider = SystemProviders().find((item) => item.id === provider)
  if (!systemProvider) {
    throw new Error(`Provider ${provider} not found in SystemProviders`)
  }

  return {
    ...getDefaultSettings(),
    ...(provider === ModelProviderEnum.ChatboxAI ? { licenseKey: apiKey } : {}),
    providers: {
      [provider]: {
        ...systemProvider.defaultSettings,
        apiKey,
        ...(apiHost ? { apiHost } : {}),
        models: [modelInfo],
      },
    },
  }
}

interface CapturedDeepSeekRequest {
  temperature?: number
  top_p?: number
  thinking?: {
    type?: string
  }
  reasoning_effort?: string
}

async function captureDeepSeekRequests<T>(
  enabled: boolean,
  operation: () => Promise<T>
): Promise<{ result: T; requests: CapturedDeepSeekRequest[] }> {
  if (!enabled) {
    return { result: await operation(), requests: [] }
  }

  const originalFetch = globalThis.fetch
  const requests: CapturedDeepSeekRequest[] = []
  globalThis.fetch = (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : ''
    if (url.startsWith('https://api.deepseek.com/') && typeof init?.body === 'string') {
      const parsed: unknown = JSON.parse(init.body)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        requests.push(parsed as CapturedDeepSeekRequest)
      }
    }
    return originalFetch(input, init)
  }

  try {
    return { result: await operation(), requests }
  } finally {
    globalThis.fetch = originalFetch
  }
}

const activeCases = getActiveCases()

describe.skipIf(activeCases.length > 0)('Thinking control provider integration tests', () => {
  it('skips real provider calls when no provider API keys are set', () => {
    expect(activeCases).toHaveLength(0)
  })
})

describe.runIf(activeCases.length > 0)('Thinking control provider integration tests', () => {
  it.for(activeCases)(
    '$name',
    async (testCase) => {
      const modelInfo = createModelInfo(testCase.modelId, testCase.apiStyle)
      const capabilities = getReasoningControlCapabilities(testCase.provider, modelInfo)
      expect(capabilities.supported).toBe(true)

      const providerOptions = getReasoningProviderOptions(testCase.provider, modelInfo, testCase.level)
      expect(providerOptions).toEqual(testCase.expectedProviderOptions)

      if (testCase.skipProviderCallReason) {
        return
      }

      const platform = new TestPlatform()
      const dependencies = await createMockModelDependencies(platform, new MockSentryAdapter())
      const globalSettings = createGlobalSettings(testCase.provider, testCase.apiKey, modelInfo, testCase.apiHost)
      if (testCase.apiHost) {
        expect(globalSettings.providers[testCase.provider]?.apiHost).toBe(testCase.apiHost)
      }
      const sessionSettings: SessionSettings = {
        provider: testCase.provider,
        modelId: testCase.modelId,
        temperature: testCase.temperature,
        topP: testCase.topP,
        maxTokens: testCase.maxTokens,
        stream: true,
      }
      const model = getModel(sessionSettings, globalSettings, newConfigs(), dependencies)
      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a concise test assistant.' },
        { role: 'user', content: testCase.prompt || 'Reply with exactly: OK' },
      ]

      const shouldCaptureDeepSeekRequest =
        testCase.provider === ModelProviderEnum.DeepSeek && testCase.expectedSamplingParameters !== undefined
      const { result, requests: deepseekRequests } = await captureDeepSeekRequests(shouldCaptureDeepSeekRequest, () =>
        model.chat(messages, { providerOptions })
      )

      if (shouldCaptureDeepSeekRequest) {
        expect(deepseekRequests.length).toBeGreaterThan(0)
        for (const request of deepseekRequests) {
          expect(request.thinking).toEqual({
            type: testCase.expectedSamplingParameters === 'included' ? 'disabled' : 'enabled',
          })
          if (testCase.expectedSamplingParameters === 'omitted') {
            expect(request.reasoning_effort).toBe('max')
          } else {
            expect(request.reasoning_effort).toBeUndefined()
          }
          if (testCase.expectedSamplingParameters === 'included') {
            expect(request.temperature).toBe(testCase.temperature)
            expect(request.top_p).toBe(testCase.topP)
          } else {
            expect(request).not.toHaveProperty('temperature')
            expect(request).not.toHaveProperty('top_p')
          }
        }
      }

      const text = result.contentParts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
      const reasoning = result.contentParts
        .filter((part) => part.type === 'reasoning')
        .map((part) => part.text)
        .join('')

      if (testCase.expectReasoning) {
        expect(reasoning.trim().length).toBeGreaterThan(0)
      }
      if (testCase.expectNoReasoning) {
        expect(reasoning.trim().length).toBe(0)
      }
      if (!testCase.expectReasoning) {
        expect(text.trim().length).toBeGreaterThan(0)
      }
      expect(`${reasoning}${text}`.trim().length).toBeGreaterThan(0)
      expect(result.finishReason).not.toBe('error')
    },
    180000
  )
})
