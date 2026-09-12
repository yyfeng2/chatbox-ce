import { describe, expect, it } from 'vitest'
import { isDeepSeekReasoningModel } from '../models/utils/deepseek'
import { ModelProviderEnum, type ProviderModelInfo } from '../types'
import {
  getLegacyOpenAICompatibleThinkingType,
  getOpenAIReasoningEffort,
  getReasoningControlCapabilities,
  getReasoningControlLevel,
  getReasoningControlOptions,
  getReasoningProviderOptions,
  isClaudeAdaptiveThinkingModel,
  isOpenAIReasoningEffortSupported,
  normalizeClaudeReasoningOptions,
  normalizeOpenAIReasoningOptions,
  resolveReasoningProviderOptions,
  setReasoningProviderOptionsForModel,
  stripReasoningProviderOptions,
  usesClaudeEffortControl,
} from './reasoning-control'

const model = (modelId: string, apiStyle?: ProviderModelInfo['apiStyle']): ProviderModelInfo => ({
  modelId,
  apiStyle,
})

describe('reasoning-control', () => {
  it('maps Claude levels to thinking token budgets', () => {
    const options = getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-sonnet-4-5'), 'medium')

    expect(options?.claude?.thinking).toEqual({ type: 'enabled', budgetTokens: 4096 })
    expect(getReasoningControlLevel(ModelProviderEnum.Claude, model('claude-sonnet-4-5'), options)).toBe('medium')
  })

  it('maps GPT reasoning models to reasoning effort', () => {
    const options = getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5.1'), 'high')

    expect(options?.openai).toEqual({
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
      include: ['reasoning.encrypted_content'],
      forceReasoning: true,
    })
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAIResponses, model('gpt-5.1')).supported).toBe(true)
  })

  it('does not offer reasoning controls for non-reasoning GPT-5 chat models', () => {
    const openaiCapabilities = getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5-chat-latest'))
    expect(openaiCapabilities.supported).toBe(false)
    expect(openaiCapabilities.disabledReason).toBeUndefined()
    // Custom providers (arbitrary ids like 'chatbox-ai'/'my-openai-proxy') are exempt from
    // the non-reasoning chat-model carve-outs: any chat model there offers reasoning
    // controls, so the OpenAI-compatible reasoning_effort scale can still be applied
    // (vLLM-style endpoints accept it unconditionally).
    expect(getReasoningControlCapabilities('chatbox-ai', model('gpt-5-chat', 'openai')).supported).toBe(
      true
    )
    expect(getReasoningControlCapabilities('my-openai-proxy', model('openai/gpt-5-chat', 'openai')).supported).toBe(
      true
    )
    // Versioned chat variants ship in the registry too (gpt-5.1-chat, gpt-5.2-chat-latest).
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5.1-chat-latest')).supported).toBe(
      false
    )
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5.2-chat')).supported).toBe(false)
    expect(
      getReasoningControlCapabilities('chatbox-ai', model('gpt-5.2-chat', 'openai')).supported
    ).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenRouter, model('openai/gpt-5.1-chat')).supported).toBe(
      false
    )
    // Real GPT-5 reasoning models keep effort controls.
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5.5')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5-mini')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-5')).supported).toBe(true)
  })

  it('maps Gemini budget and level models differently', () => {
    const budgetOptions = getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), 'low')
    const levelOptions = getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-3-pro-preview'), 'high')

    expect(budgetOptions?.google?.thinkingConfig).toEqual({ thinkingBudget: 1024, includeThoughts: true })
    expect(levelOptions?.google?.thinkingConfig).toEqual({ thinkingLevel: 'high', includeThoughts: true })
  })

  it('does not offer thinking controls for Gemini image generation models', () => {
    expect(getReasoningControlCapabilities(ModelProviderEnum.Gemini, model('gemini-2.5-flash-image')).supported).toBe(
      false
    )
    expect(
      getReasoningControlCapabilities(ModelProviderEnum.Gemini, model('gemini-3-pro-image-preview')).supported
    ).toBe(false)
    expect(
      getReasoningControlCapabilities(ModelProviderEnum.Gemini, model('gemini-2.5-flash-image')).disabledReason
    ).toBeUndefined()
  })

  it('maps DeepSeek effort levels and Qwen budget reasoning', () => {
    const deepseek = getReasoningProviderOptions(ModelProviderEnum.DeepSeek, model('deepseek-reasoner'), 'low')
    const deepseekV4 = getReasoningProviderOptions(ModelProviderEnum.DeepSeek, model('deepseek-v4-pro'), 'medium')
    const deepseekV32 = getReasoningProviderOptions(ModelProviderEnum.DeepSeek, model('deepseek-v3.2-thinking'), 'high')
    const qwen = getReasoningProviderOptions(ModelProviderEnum.Qwen, model('qwen3.7-max'), 'high')

    expect(deepseek?.deepseek).toEqual({ thinking: { type: 'enabled' } })
    // DeepSeek V4 uses the full effort scale, so the UI level maps 1:1 to the wire.
    expect(deepseekV4?.deepseek).toEqual({ thinking: { type: 'enabled' }, reasoningEffort: 'medium' })
    expect(deepseekV32?.deepseek).toEqual({ thinking: { type: 'enabled' } })
    expect(getReasoningControlLevel(ModelProviderEnum.DeepSeek, model('deepseek-v3.2-thinking'), deepseekV32)).toBe(
      'high'
    )
    expect(qwen?.openaiCompatible).toEqual({ enable_thinking: true, thinking_budget: 8192 })
  })

  it('adapts selectable levels to the model thinking format', () => {
    expect(getReasoningControlOptions(ModelProviderEnum.DeepSeek, model('deepseek-reasoner'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'high', label: 'on' },
    ])
    expect(getReasoningControlOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5.5'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'high', label: 'high' },
      { level: 'max', label: 'max' },
    ])
  })

  it('omits the off option for models whose thinking cannot be force-disabled', () => {
    // Gemini 2.5 Pro rejects thinkingBudget: 0 (minimum budget is 128).
    expect(getReasoningControlOptions(ModelProviderEnum.Gemini, model('gemini-2.5-pro'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'medium', label: 'medium' },
      { level: 'high', label: 'high' },
    ])
    // Claude effort/adaptive models are controlled via the effort param only; an explicit
    // thinking disable never reaches the wire, so no off option is offered. They expose
    // the three-tier effort scale (low/high/max).
    expect(getReasoningControlOptions(ModelProviderEnum.Claude, model('claude-opus-4-5'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'high', label: 'high' },
      { level: 'max', label: 'max' },
    ])
    expect(getReasoningControlOptions(ModelProviderEnum.Claude, model('claude-opus-4-8'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'high', label: 'high' },
      { level: 'max', label: 'max' },
    ])
    expect(getReasoningControlOptions(ModelProviderEnum.Claude, model('claude-opus-5'))).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'high', label: 'high' },
      { level: 'max', label: 'max' },
    ])
    // The off option is no longer offered in the menu for any family, including
    // budget-style Claude and Gemini Flash.
    expect(getReasoningControlOptions(ModelProviderEnum.Claude, model('claude-sonnet-4-6')).map((o) => o.level)).toEqual(
      ['default', 'low', 'medium', 'high']
    )
    expect(getReasoningControlOptions(ModelProviderEnum.Gemini, model('gemini-2.5-flash')).map((o) => o.level)).toEqual([
      'default',
      'low',
      'medium',
      'high',
    ])
    // Registry id variants and proxied google apiStyle must also lose the off option.
    for (const id of ['gemini-2.5-pro-preview-06-05', 'models/gemini-2.5-pro']) {
      const levels = getReasoningControlOptions(ModelProviderEnum.Gemini, model(id)).map((o) => o.level)
      expect(levels).not.toContain('off')
    }
    const proxied = getReasoningControlOptions('chatbox-ai', model('gemini-2.5-pro', 'google'))
    expect(proxied.map((o) => o.level)).not.toContain('off')
  })

  it('reads stale off-style options as default on models without an off option', () => {
    // Old versions offered off for Gemini 2.5 Pro and persisted thinkingBudget: 0;
    // the displayed level must remain one of the offered options.
    const staleGoogle = { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } }
    const geminiPro = model('gemini-2.5-pro')
    const level = getReasoningControlLevel(ModelProviderEnum.Gemini, geminiPro, staleGoogle)
    expect(level).toBe('default')
    expect(getReasoningControlOptions(ModelProviderEnum.Gemini, geminiPro).map((o) => o.level)).toContain(level)
    // Gemini Flash keeps reading the same options as an explicit off.
    expect(getReasoningControlLevel(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), staleGoogle)).toBe('off')
  })

  it('reads explicit disable options as off across providers', () => {
    expect(
      getReasoningControlLevel(ModelProviderEnum.Qwen, model('qwen3.7-max'), {
        openaiCompatible: { enable_thinking: false },
      })
    ).toBe('off')
    expect(
      getReasoningControlLevel(ModelProviderEnum.DeepSeek, model('deepseek-reasoner'), {
        deepseek: { thinking: { type: 'disabled' } },
      })
    ).toBe('off')
    // Custom (arbitrary id, e.g. 'chatbox-ai') DeepSeek models read/write the off state
    // via openai.reasoningEffort; a legacy openaiCompatible.reasoning toggle is no longer
    // interpreted for them.
    expect(
      getReasoningControlLevel('chatbox-ai', model('deepseek-v4-pro', 'openai'), {
        openaiCompatible: { reasoning: { enabled: false } },
      })
    ).toBe('default')
    expect(
      getReasoningControlLevel('chatbox-ai', model('deepseek-v4-pro', 'openai'), {
        openai: { reasoningEffort: 'none' },
      })
    ).toBe('off')
    expect(getReasoningControlLevel(ModelProviderEnum.XAI, model('grok-4.3'), undefined)).toBe('default')
    expect(
      getReasoningControlLevel(ModelProviderEnum.XAI, model('grok-4.3'), {
        openai: { reasoningEffort: 'none', forceReasoning: true },
      })
    ).toBe('off')
  })

  it('drops mismatched-generation Claude options at the request edge', () => {
    // Budget-style thinking persisted under a Sonnet session must not be sent to an
    // adaptive effort model after a model switch (and vice versa).
    expect(
      normalizeClaudeReasoningOptions('claude-opus-4-8', { thinking: { type: 'enabled', budgetTokens: 8192 } })
    ).toBeUndefined()
    expect(normalizeClaudeReasoningOptions('claude-opus-4-5', { effort: 'high' })).toEqual({ effort: 'high' })
    expect(normalizeClaudeReasoningOptions('claude-opus-5', { effort: 'high' })).toEqual({ effort: 'high' })
    expect(
      normalizeClaudeReasoningOptions('claude-opus-4-7', {
        effort: 'low',
        thinking: { type: 'enabled', budgetTokens: 1024 },
      })
    ).toEqual({ effort: 'low' })
    expect(normalizeClaudeReasoningOptions('claude-sonnet-4-6', { effort: 'high' })).toBeUndefined()
    expect(
      normalizeClaudeReasoningOptions('claude-sonnet-4-6', { thinking: { type: 'disabled', budgetTokens: 0 } })
    ).toEqual({ thinking: { type: 'disabled', budgetTokens: 0 } })
    expect(normalizeClaudeReasoningOptions('claude-sonnet-4-6', undefined)).toBeUndefined()
    expect(usesClaudeEffortControl('claude-opus-4-5')).toBe(true)
    expect(usesClaudeEffortControl('claude-opus-4-8')).toBe(true)
    expect(usesClaudeEffortControl('claude-opus-5')).toBe(true)
    expect(usesClaudeEffortControl('claude-sonnet-4-6')).toBe(false)
  })

  it('offers effort controls for OpenAI o-series models without an off option', () => {
    for (const provider of [ModelProviderEnum.OpenAI, ModelProviderEnum.OpenAIResponses, ModelProviderEnum.Azure]) {
      expect(getReasoningControlCapabilities(provider, model('o3'))).toEqual({
        supported: true,
        kind: 'openai-effort',
      })
    }
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('o4-mini')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('o1')).supported).toBe(true)
    // o1-preview/o1-mini predate reasoning_effort — the API rejects the parameter, so
    // they must not get effort controls (and no disabledReason: they are simply unsupported).
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('o1-preview'))).toEqual({
      supported: false,
      kind: 'toggle',
    })
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('o1-mini')).supported).toBe(false)
    // o-series only accepts low/high/max — no minimal/none, so no off option.
    expect(getReasoningControlOptions(ModelProviderEnum.OpenAI, model('o3')).map((o) => o.level)).toEqual([
      'default',
      'low',
      'high',
      'max',
    ])
    // ChatboxAI / custom providers route o-series by API style.
    expect(getReasoningControlCapabilities('chatbox-ai', model('o3', 'openai')).kind).toBe(
      'openai-effort'
    )
    expect(getReasoningControlCapabilities('my-openai-proxy', model('o3', 'openai-responses')).supported).toBe(true)
    // Custom providers (arbitrary id) offer controls regardless of api-style mismatch:
    // O3 behind an anthropic-style custom endpoint routes to the anthropic effort wire.
    expect(getReasoningControlCapabilities('acme-llm', model('o3', 'anthropic')).supported).toBe(true)
    expect(getReasoningControlCapabilities('acme-llm', model('o3', 'anthropic')).kind).toBe('anthropic-effort')
    // Requesting off falls back to stripping; levels map to plain reasoning effort.
    expect(
      getReasoningProviderOptions(ModelProviderEnum.OpenAI, model('o3'), 'off', {
        openai: { reasoningEffort: 'high' },
      })
    ).toBeUndefined()
    expect(getReasoningProviderOptions(ModelProviderEnum.OpenAI, model('o3'), 'medium')?.openai?.reasoningEffort).toBe(
      'medium'
    )
    // A stale minimal effort reads back as default (off is not representable).
    expect(
      getReasoningControlLevel(ModelProviderEnum.OpenAI, model('o3'), { openai: { reasoningEffort: 'minimal' } })
    ).toBe('default')
    // gpt-4o must not be classified as an o-series reasoning model.
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, model('gpt-4o')).supported).toBe(false)
    // The off option is gone from every menu; o1-preview stays reasoning-capable
    // on OpenRouter (OpenRouter maps params per model).
    expect(getReasoningControlOptions(ModelProviderEnum.OpenRouter, model('openai/o3')).map((o) => o.level)).not.toContain(
      'off'
    )
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenRouter, model('openai/o1-preview')).supported).toBe(
      true
    )
  })

  it('strips reasoning efforts the target OpenAI model rejects at the request edge', () => {
    // Stale GPT-5 off state (minimal/none) carried onto o-series via a model switch.
    expect(normalizeOpenAIReasoningOptions('o3', { reasoningEffort: 'minimal', forceReasoning: true })).toBeUndefined()
    expect(normalizeOpenAIReasoningOptions('o4-mini', { reasoningEffort: 'none' })).toBeUndefined()
    // Valid efforts pass through untouched for o-series and GPT-5 models.
    expect(normalizeOpenAIReasoningOptions('o3', { reasoningEffort: 'medium' })).toEqual({ reasoningEffort: 'medium' })
    expect(normalizeOpenAIReasoningOptions('gpt-5', { reasoningEffort: 'minimal', forceReasoning: true })).toEqual({
      reasoningEffort: 'minimal',
      forceReasoning: true,
    })
    // o1-preview/o1-mini reject the parameter entirely — everything is dropped.
    expect(normalizeOpenAIReasoningOptions('o1-preview', { reasoningEffort: 'medium' })).toBeUndefined()
    expect(normalizeOpenAIReasoningOptions('o1-mini', { reasoningSummary: 'auto' })).toBeUndefined()
    expect(normalizeOpenAIReasoningOptions('o1', { reasoningEffort: 'high' })).toEqual({ reasoningEffort: 'high' })
    expect(normalizeOpenAIReasoningOptions('gpt-5.1', undefined)).toBeUndefined()
    expect(isOpenAIReasoningEffortSupported('o3', 'minimal')).toBe(false)
    expect(isOpenAIReasoningEffortSupported('o3', 'high')).toBe(true)
    expect(isOpenAIReasoningEffortSupported('o1-preview', 'high')).toBe(false)
    expect(isOpenAIReasoningEffortSupported('gpt-5.1', 'none')).toBe(true)
  })

  it('reads legacy session-settings modal budgets back as the originally chosen level', () => {
    // The deleted modal wrote presets 2048/5120/10240 for Gemini; the readback
    // boundaries must map them to Low/Medium/High, same as the new 1024/8192/24576.
    const geminiLevel = (budget: number) =>
      getReasoningControlLevel(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), {
        google: { thinkingConfig: { thinkingBudget: budget, includeThoughts: true } },
      })
    expect(geminiLevel(2048)).toBe('low')
    expect(geminiLevel(5120)).toBe('medium')
    expect(geminiLevel(10240)).toBe('high')
    expect(geminiLevel(1024)).toBe('low')
    expect(geminiLevel(8192)).toBe('medium')
    expect(geminiLevel(24576)).toBe('high')
    // Claude thresholds (1024/4096/8192) already map the legacy presets correctly.
    const claudeLevel = (budget: number) =>
      getReasoningControlLevel(ModelProviderEnum.Claude, model('claude-sonnet-4-6'), {
        claude: { thinking: { type: 'enabled', budgetTokens: budget } },
      })
    expect(claudeLevel(2048)).toBe('low')
    expect(claudeLevel(5120)).toBe('medium')
    expect(claudeLevel(10240)).toBe('high')
  })

  it('sends none-style off effort for all dotted gpt-5.x generations', () => {
    for (const id of ['gpt-5.1', 'gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.5', 'gpt-5.10']) {
      expect(getOpenAIReasoningEffort(id, 'off')).toBe('none')
    }
    expect(getOpenAIReasoningEffort('gpt-5', 'off')).toBe('minimal')
    expect(getOpenAIReasoningEffort('gpt-5-mini', 'off')).toBe('minimal')
  })

  it('treats missing reasoning options as the default level and strips them on selection', () => {
    // No persisted options → default (nothing is sent, the provider default applies).
    expect(getReasoningControlLevel(ModelProviderEnum.OpenAIResponses, model('gpt-5.1'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.Claude, model('claude-sonnet-4-6'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.Claude, model('claude-opus-4-8'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.DeepSeek, model('deepseek-reasoner'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.Qwen, model('qwen3.7-max'), undefined)).toBe('default')
    expect(getReasoningControlLevel(ModelProviderEnum.OpenRouter, model('deepseek/deepseek-v4-pro'), undefined)).toBe(
      'default'
    )
    expect(getReasoningControlLevel('chatbox-ai', model('deepseek-v4-pro', 'openai'), undefined)).toBe(
      'default'
    )

    // Selecting default removes every reasoning namespace but keeps nothing else behind.
    expect(
      getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5.1'), 'default', {
        openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
      })
    ).toBeUndefined()
    expect(
      getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-sonnet-4-6'), 'default', {
        claude: { thinking: { type: 'enabled', budgetTokens: 4096 } },
      })
    ).toBeUndefined()
    expect(getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), 'default')).toBeUndefined()

    // Explicit off states still read back as off, not default.
    expect(
      getReasoningControlLevel(ModelProviderEnum.OpenAIResponses, model('gpt-5.1'), {
        openai: { reasoningEffort: 'none', forceReasoning: true },
      })
    ).toBe('off')
    expect(
      getReasoningControlLevel(ModelProviderEnum.Claude, model('claude-sonnet-4-6'), {
        claude: { thinking: { type: 'disabled', budgetTokens: 0 } },
      })
    ).toBe('off')
  })

  it('maps off to explicit disable or minimum reasoning parameters per provider', () => {
    expect(getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-sonnet-4-6'), 'off')).toEqual({
      claude: { thinking: { type: 'disabled', budgetTokens: 0 } },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-opus-4-8'), 'off')).toBeUndefined()
    expect(getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5.5'), 'off')).toEqual({
      openai: { reasoningEffort: 'none', forceReasoning: true },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5'), 'off')).toEqual({
      openai: { reasoningEffort: 'minimal', forceReasoning: true },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-2.5-flash'), 'off')).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-3-pro-preview'), 'off')).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.Gemini, model('gemini-3-flash-preview'), 'off')).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false } },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.DeepSeek, model('deepseek-v4-pro'), 'off')).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.Qwen, model('qwen3.7-max'), 'off')).toEqual({
      openaiCompatible: { enable_thinking: false },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.XAI, model('grok-4.3'), 'off')).toEqual({
      openai: { reasoningEffort: 'none', forceReasoning: true },
    })
    expect(getReasoningProviderOptions(ModelProviderEnum.OpenRouter, model('deepseek/deepseek-v4-pro'), 'off')).toEqual(
      {
        openrouter: { reasoning: { enabled: false, exclude: true } },
      }
    )
    expect(getReasoningProviderOptions('chatbox-ai', model('deepseek-v4-pro', 'openai'), 'off')).toEqual({
      openai: { reasoningEffort: 'minimal', forceReasoning: true },
    })
  })

  it('keeps native DeepSeek provider enabled even when UI fallback adds openai apiStyle', () => {
    const reasoner = model('deepseek-reasoner', 'openai')
    const v4 = model('deepseek-v4-pro', 'openai')
    const options = getReasoningProviderOptions(ModelProviderEnum.DeepSeek, reasoner, 'high')

    expect(getReasoningControlCapabilities(ModelProviderEnum.DeepSeek, reasoner)).toEqual({
      supported: true,
      kind: 'toggle',
    })
    expect(getReasoningControlCapabilities(ModelProviderEnum.DeepSeek, v4)).toEqual({
      supported: true,
      kind: 'deepseek-effort',
    })
    expect(getReasoningControlOptions(ModelProviderEnum.DeepSeek, v4)).toEqual([
      { level: 'default', label: 'default' },
      { level: 'low', label: 'low' },
      { level: 'high', label: 'high' },
      { level: 'max', label: 'max' },
    ])
    expect(options?.deepseek).toEqual({ thinking: { type: 'enabled' } })
  })

  it('reads missing or invalid V4 effort as default instead of inventing a level', () => {
    const v4 = model('deepseek-v4-pro', 'openai')

    expect(
      getReasoningControlLevel('chatbox-ai', v4, {
        deepseek: { thinking: { type: 'enabled' } },
      })
    ).toBe('default')
    // A malformed effort value (not in the V4 scale) must read back as default.
    expect(
      getReasoningControlLevel('chatbox-ai', v4, {
        deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'bogus' as unknown as 'low' },
      })
    ).toBe('default')
  })

  it('does not use unreliable capabilities to enable unknown DeepSeek model ids', () => {
    const modelInfo: ProviderModelInfo = {
      modelId: 'deepseek-next-reasoning',
      capabilities: ['reasoning'],
    }

    expect(getReasoningControlCapabilities(ModelProviderEnum.DeepSeek, modelInfo).supported).toBe(false)
  })

  it('offers thinking controls to every chat/task model on custom providers regardless of the reasoning capability flag', () => {
    // Custom providers wrap opaque upstream endpoints whose models cannot be
    // classified by id. Any chat model is treated as reasoning-capable (OpenAI-
    // compatible endpoints accept the reasoning_effort scale), so no flag is needed.
    const openaiModel: ProviderModelInfo = { modelId: 'my-reasoning-model', apiStyle: 'openai', capabilities: ['reasoning'] }
    expect(getReasoningControlCapabilities('my-custom-provider', openaiModel).supported).toBe(true)
    expect(getReasoningControlCapabilities('my-custom-provider', openaiModel).kind).toBe('openai-effort')

    // The flag is no longer required for the control to appear, and DeepSeek models on
    // custom OpenAI-compatible endpoints use the reasoning_effort wire (deepseek-effort
    // would write the deepseek namespace, which custom model classes never read).
    const unflaggedModel: ProviderModelInfo = { modelId: 'deepseek-r1-0702', apiStyle: 'openai' }
    expect(getReasoningControlCapabilities('my-custom-provider', unflaggedModel).supported).toBe(true)
    expect(getReasoningControlCapabilities('my-custom-provider', unflaggedModel).kind).toBe('openai-effort')

    const customEnumModel: ProviderModelInfo = { modelId: 'some-chat-model', apiStyle: 'openai' }
    expect(
      getReasoningControlCapabilities(ModelProviderEnum.Custom, customEnumModel).supported
    ).toBe(true)

    const claudeModel: ProviderModelInfo = { modelId: 'my-claude-model', apiStyle: 'anthropic', capabilities: ['reasoning'] }
    expect(getReasoningControlCapabilities('my-custom-provider', claudeModel).kind).toBe('anthropic-effort')

    // A DeepSeek model behind a custom OpenAI-compatible endpoint must always write the
    // reasoning_effort wire (never the deepseek namespace its custom class won't read),
    // and the off state must use reasoning_effort none/minimal — this was the user-facing
    // "adjust has no effect" bug.
    const deepseekModel: ProviderModelInfo = { modelId: 'deepseek-r1-0702', apiStyle: 'openai' }
    const dsHigh = getReasoningProviderOptions('my-custom-provider', deepseekModel, 'high')
    expect(dsHigh?.openai?.reasoningEffort).toBe('high')
    expect(dsHigh?.deepseek).toBeUndefined()
    const dsOff = getReasoningProviderOptions('my-custom-provider', deepseekModel, 'off')
    expect(dsOff?.openai?.reasoningEffort).toBe('minimal')
    expect(dsOff?.deepseek).toBeUndefined()
    expect(getReasoningControlLevel('my-custom-provider', deepseekModel, dsHigh)).toBe('high')

    // The wire format matches the effective provider (API style) and reads back to
    // the level the user picked.
    const highOpenAI = getReasoningProviderOptions('my-custom-provider', openaiModel, 'high')
    expect(highOpenAI?.openai?.reasoningEffort).toBe('high')
    expect(getReasoningControlLevel('my-custom-provider', openaiModel, highOpenAI)).toBe('high')

    const highClaude = getReasoningProviderOptions('my-custom-provider', claudeModel, 'high')
    expect(highClaude?.claude?.effort).toBe('high')
    expect(getReasoningControlLevel('my-custom-provider', claudeModel, highClaude)).toBe('high')

    // Non-chat models (image/embedding/rerank) stay control-free even on custom providers.
    expect(
      getReasoningControlCapabilities('my-custom-provider', { modelId: 'gpt-image-1', type: 'image', apiStyle: 'openai' }).supported
    ).toBe(false)
    expect(
      getReasoningControlCapabilities('my-custom-provider', { modelId: 'embed-3', type: 'embedding', apiStyle: 'openai' }).supported
    ).toBe(false)

    // Built-in providers are untouched: the flag alone does not enable controls.
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenAI, { modelId: 'gpt-4o', capabilities: ['reasoning'] }).supported).toBe(false)
  })

  it('maps xAI Grok 4.3 to OpenAI-compatible reasoning effort', () => {
    const offOptions = getReasoningProviderOptions(ModelProviderEnum.XAI, model('grok-4.3'), 'off')
    const lowOptions = getReasoningProviderOptions(ModelProviderEnum.XAI, model('grok-4.3'), 'low')
    const aliasOptions = getReasoningProviderOptions(ModelProviderEnum.XAI, model('grok-4-1-fast'), 'medium')

    expect(offOptions?.openai).toEqual({ reasoningEffort: 'none', forceReasoning: true })
    expect(lowOptions?.openai).toEqual({
      reasoningEffort: 'low',
      include: ['reasoning.encrypted_content'],
      forceReasoning: true,
    })
    expect(aliasOptions?.openai).toEqual({
      reasoningEffort: 'medium',
      include: ['reasoning.encrypted_content'],
      forceReasoning: true,
    })
    expect(getReasoningControlCapabilities(ModelProviderEnum.XAI, model('grok-4')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.XAI, model('grok-4-fast')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.XAI, model('grok-4-1-fast')).supported).toBe(true)
    expect(getReasoningControlCapabilities(ModelProviderEnum.XAI, model('grok-4-1-fast-non-reasoning')).supported).toBe(
      false
    )
  })

  it('keeps generation-specific Claude and OpenAI effort formats', () => {
    const claudeEffort = getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-opus-4-5'), 'medium')
    const claudeAdaptive = getReasoningProviderOptions(ModelProviderEnum.Claude, model('claude-opus-4-8'), 'high')
    const gpt51Off = getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5.1'), 'off')
    const gpt5Off = getReasoningProviderOptions(ModelProviderEnum.OpenAIResponses, model('gpt-5'), 'off')

    expect(claudeEffort?.claude).toEqual({ effort: 'medium' })
    expect(claudeAdaptive?.claude).toEqual({ effort: 'high' })
    expect(gpt51Off?.openai?.reasoningEffort).toBe('none')
    expect(gpt51Off?.openai?.forceReasoning).toBe(true)
    expect(gpt5Off?.openai?.reasoningEffort).toBe('minimal')
    expect(gpt5Off?.openai?.forceReasoning).toBe(true)
  })

  it('uses the custom provider apiStyle to select the backend mapping', () => {
    // 'chatbox-ai' is no longer a built-in provider in this fork, so any model under it
    // is treated as a custom provider and routed by its configured API style.
    const anthropicOptions = getReasoningProviderOptions(
      'chatbox-ai',
      model('claude-sonnet-4-5', 'anthropic'),
      'low'
    )
    const googleOptions = getReasoningProviderOptions(
      'my-openai-proxy',
      model('gemini-2.5-pro', 'google'),
      'medium'
    )

    // Claude-style custom endpoint → anthropic effort wire.
    expect(anthropicOptions?.claude).toEqual({ effort: 'low' })
    // Google-style custom endpoint → thinkingBudget wire.
    expect(googleOptions?.google?.thinkingConfig?.thinkingBudget).toBe(8192)
  })

  it('no longer disables thinking controls on custom providers for api-style mismatches', () => {
    // Custom providers (arbitrary id like 'chatbox-ai', or the literal 'custom' type) are
    // never blocked by the api-style disabled checks: the user controls the endpoint, so a
    // Claude/Gemini model behind any style simply routes to that style's wire format.
    const customEnumAnthropic = getReasoningControlCapabilities(
      ModelProviderEnum.Custom,
      model('claude-sonnet-4-6', 'anthropic')
    )
    const chatboxClaudeAsOpenAI = getReasoningControlCapabilities(
      'chatbox-ai',
      model('claude-sonnet-4-5', 'openai')
    )
    const chatboxGeminiAsAnthropic = getReasoningControlCapabilities(
      'chatbox-ai',
      model('gemini-2.5-flash', 'anthropic')
    )
    const chatboxDeepSeekAsOpenAI = getReasoningControlCapabilities(
      'chatbox-ai',
      model('deepseek-v4-pro', 'openai')
    )
    const chatboxDeepSeekAsAnthropic = getReasoningControlCapabilities(
      'chatbox-ai',
      model('deepseek-v4-pro', 'anthropic')
    )

    expect(customEnumAnthropic.supported).toBe(true)
    expect(customEnumAnthropic.kind).toBe('anthropic-effort')
    expect(chatboxClaudeAsOpenAI.supported).toBe(true)
    expect(chatboxClaudeAsOpenAI.kind).toBe('openai-effort')
    expect(chatboxGeminiAsAnthropic.supported).toBe(true)
    expect(chatboxGeminiAsAnthropic.kind).toBe('anthropic-effort')
    expect(chatboxDeepSeekAsOpenAI.supported).toBe(true)
    // DeepSeek on a custom provider always uses the reasoning_effort wire (custom model
    // classes never read the deepseek namespace), regardless of the configured API style.
    expect(chatboxDeepSeekAsOpenAI.kind).toBe('openai-effort')
    expect(chatboxDeepSeekAsAnthropic.supported).toBe(true)
    expect(chatboxDeepSeekAsAnthropic.kind).toBe('openai-effort')
  })

  it('judges custom providers (arbitrary ids) by API style + model id', () => {
    // A user-created provider has an arbitrary id, not the literal 'custom' enum value.
    // Reasoning support must still resolve via its API style (provider type) + model id.
    const customOpenAIGpt5 = getReasoningControlCapabilities('my-openai-proxy', model('gpt-5.1', 'openai'))
    const customAnthropicClaude = getReasoningControlCapabilities('acme-llm', model('claude-opus-4-8', 'anthropic'))
    const customOpenAIDeepSeek = getReasoningControlCapabilities(
      'my-openai-proxy',
      model('deepseek-reasoner', 'openai')
    )
    const customOpenAIPlainChat = getReasoningControlCapabilities('my-openai-proxy', model('some-chat-model', 'openai'))
    const customAnthropicMismatch = getReasoningControlCapabilities('acme-llm', model('claude-opus-4-8', 'openai'))

    expect(customOpenAIGpt5.supported).toBe(true)
    expect(customOpenAIGpt5.kind).toBe('openai-effort')
    expect(customAnthropicClaude.supported).toBe(true)
    expect(customOpenAIDeepSeek.supported).toBe(true)
    // DeepSeek models on custom OpenAI-compatible endpoints use the reasoning_effort wire
    // (the deepseek namespace is only consumed by the native DeepSeek provider class).
    expect(customOpenAIDeepSeek.kind).toBe('openai-effort')
    // Any chat model on a custom provider offers reasoning controls (OpenAI-compatible
    // reasoning_effort is accepted even by non-reasoning models), so no id heuristic and
    // no capability flag gate it.
    expect(customOpenAIPlainChat.supported).toBe(true)
    expect(customOpenAIPlainChat.kind).toBe('openai-effort')
    // A model id matching a built-in family is not "flagged" on a custom provider: the
    // user controls the endpoint they pointed the provider at, so the api-style mismatch
    // checks do not apply and the wire follows the configured API style (here OpenAI).
    expect(customAnthropicMismatch.supported).toBe(true)
    expect(customAnthropicMismatch.kind).toBe('openai-effort')
  })

  it('uses OpenRouter reasoning controls for reasoning-capable OpenRouter models', () => {
    const modelInfo: ProviderModelInfo = {
      modelId: 'anthropic/claude-sonnet-4.6',
    }
    const options = getReasoningProviderOptions(ModelProviderEnum.OpenRouter, modelInfo, 'high')

    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenRouter, modelInfo)).toEqual({
      supported: true,
      kind: 'openrouter-reasoning',
    })
    expect(options?.openrouter).toEqual({ reasoning: { effort: 'high', exclude: false } })
    expect(getReasoningControlLevel(ModelProviderEnum.OpenRouter, modelInfo, options)).toBe('high')
  })

  it('uses OpenRouter enabled=false rather than unsupported minimal effort for off state', () => {
    const modelInfo: ProviderModelInfo = {
      modelId: 'deepseek/deepseek-v4-pro',
    }
    const options = getReasoningProviderOptions(ModelProviderEnum.OpenRouter, modelInfo, 'off')

    // Latest DeepSeek V4 routed via OpenRouter must still be detected as reasoning-capable.
    expect(getReasoningControlCapabilities(ModelProviderEnum.OpenRouter, modelInfo)).toEqual({
      supported: true,
      kind: 'openrouter-reasoning',
    })
    expect(options?.openrouter).toEqual({ reasoning: { enabled: false, exclude: true } })
    expect(getReasoningControlLevel(ModelProviderEnum.OpenRouter, modelInfo, options)).toBe('off')
  })

  it('reads the selected level only from the current model api style', () => {
    const claudeBudgetModel = model('claude-sonnet-4-6')
    const claudeAdaptiveModel = model('claude-opus-4-8')
    const gptModel = model('gpt-5.5')

    // Options written for a different model format are not interpreted as a level;
    // they read back as the untouched default state.
    expect(
      getReasoningControlLevel(ModelProviderEnum.Claude, claudeBudgetModel, {
        claude: { effort: 'high' },
      })
    ).toBe('default')
    expect(
      getReasoningControlLevel(ModelProviderEnum.Claude, claudeAdaptiveModel, {
        claude: { thinking: { type: 'enabled', budgetTokens: 8192 } },
      })
    ).toBe('default')
    expect(
      getReasoningControlLevel(ModelProviderEnum.OpenAIResponses, gptModel, {
        claude: { thinking: { type: 'enabled', budgetTokens: 8192 } },
      })
    ).toBe('default')
  })

  it('falls back to stripping options when off is requested for effort-style Claude', () => {
    const modelInfo = model('claude-opus-4-8')
    const options = getReasoningProviderOptions(ModelProviderEnum.Claude, modelInfo, 'off', {
      claude: { effort: 'high' },
    })

    expect(options?.claude).toBeUndefined()
    expect(getReasoningControlLevel(ModelProviderEnum.Claude, modelInfo, options)).toBe('default')
  })

  it('falls back to stripping options when off is requested for Gemini 2.5 Pro', () => {
    const modelInfo = model('gemini-2.5-pro')
    const options = getReasoningProviderOptions(ModelProviderEnum.Gemini, modelInfo, 'off', {
      google: { thinkingConfig: { thinkingBudget: 8192, includeThoughts: true } },
    })

    expect(options).toBeUndefined()
    expect(getReasoningControlLevel(ModelProviderEnum.Gemini, modelInfo, options)).toBe('default')
  })

  it('treats Azure like other OpenAI-style providers', () => {
    const gptModel = model('gpt-5.1')
    const onOptions = getReasoningProviderOptions(ModelProviderEnum.Azure, gptModel, 'medium')
    const offOptions = getReasoningProviderOptions(ModelProviderEnum.Azure, gptModel, 'off')

    expect(getReasoningControlCapabilities(ModelProviderEnum.Azure, gptModel)).toEqual({
      supported: true,
      kind: 'openai-effort',
    })
    expect(onOptions?.openai).toEqual({ reasoningEffort: 'medium' })
    expect(offOptions?.openai).toEqual({ reasoningEffort: 'none', forceReasoning: true })
    expect(getReasoningControlLevel(ModelProviderEnum.Azure, gptModel, onOptions)).toBe('medium')
    expect(getReasoningControlLevel(ModelProviderEnum.Azure, gptModel, offOptions)).toBe('off')
  })

  it('interprets legacy openaiCompatible reasoning options as a thinking toggle', () => {
    expect(getLegacyOpenAICompatibleThinkingType(undefined)).toBeUndefined()
    expect(getLegacyOpenAICompatibleThinkingType({})).toBeUndefined()
    expect(getLegacyOpenAICompatibleThinkingType({ enabled: true })).toBe('enabled')
    expect(getLegacyOpenAICompatibleThinkingType({ enabled: false })).toBe('disabled')
    expect(getLegacyOpenAICompatibleThinkingType({ exclude: true })).toBe('disabled')
    expect(getLegacyOpenAICompatibleThinkingType({ enabled: true, exclude: true })).toBe('disabled')
  })

  it('shares model-id matchers between capability detection and providers', () => {
    expect(isDeepSeekReasoningModel('deepseek-reasoner')).toBe(true)
    expect(isDeepSeekReasoningModel('deepseek/deepseek-r1:free')).toBe(true)
    expect(isDeepSeekReasoningModel('deepseek-v3.2-thinking')).toBe(true)
    expect(isDeepSeekReasoningModel('deepseek-chat')).toBe(false)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-4-7')).toBe(true)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-4-8')).toBe(true)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-5')).toBe(true)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-4-5')).toBe(false)
    // Dated ids keep matching; larger version numbers must not false-match.
    expect(isClaudeAdaptiveThinkingModel('claude-opus-4-7-20260115')).toBe(true)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-5-20260601')).toBe(true)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-4-70')).toBe(false)
    expect(isClaudeAdaptiveThinkingModel('claude-opus-50')).toBe(false)
    expect(usesClaudeEffortControl('claude-opus-4-5-20251101')).toBe(true)
    expect(usesClaudeEffortControl('claude-opus-4-50')).toBe(false)
  })

  describe('stripReasoningProviderOptions', () => {
    it('returns undefined/empty inputs unchanged', () => {
      expect(stripReasoningProviderOptions(undefined)).toBeUndefined()
      expect(stripReasoningProviderOptions({})).toEqual({})
    })

    it('removes all reasoning provider option namespaces', () => {
      expect(
        stripReasoningProviderOptions({
          openai: { reasoningEffort: 'none', forceReasoning: true },
        })
      ).toBeUndefined()
      expect(
        stripReasoningProviderOptions({
          claude: { thinking: { type: 'enabled', budgetTokens: 1024 } },
          google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
          openaiCompatible: { enable_thinking: true },
        })
      ).toBeUndefined()
    })

    it('returns the same reference when there is nothing to strip', () => {
      const input = {}
      expect(stripReasoningProviderOptions(input)).toBe(input)
    })
  })

  describe('per-model reasoning provider options', () => {
    const deepseekOptions = { claude: { thinking: { type: 'enabled' as const }, effort: 'max' as const } }
    const claudeOptions = { claude: { thinking: { type: 'enabled' as const, budgetTokens: 4096 } } }

    it('scopes options to the provider+model they were written for', () => {
      const written = setReasoningProviderOptionsForModel(
        undefined,
        'chatbox-ai',
        'deepseek-v4-pro',
        deepseekOptions
      )

      // The legacy shared field is cleared; the map is the single source of truth.
      expect(written.providerOptions).toBeUndefined()
      expect(written.providerOptionsByModel).toEqual({ 'chatbox-ai:deepseek-v4-pro': deepseekOptions })
      expect(resolveReasoningProviderOptions(written, 'chatbox-ai', 'deepseek-v4-pro')).toEqual(
        deepseekOptions
      )
      // A switched model must not inherit another model's parameters.
      expect(
        resolveReasoningProviderOptions(written, 'chatbox-ai', 'claude-sonnet-4-20250514')
      ).toBeUndefined()
      expect(resolveReasoningProviderOptions(written, ModelProviderEnum.OpenAI, 'gpt-5.5')).toBeUndefined()
    })

    it('keeps entries of other models and removes an entry on the default level', () => {
      const first = setReasoningProviderOptionsForModel(
        undefined,
        'chatbox-ai',
        'deepseek-v4-pro',
        deepseekOptions
      )
      const second = setReasoningProviderOptionsForModel(
        first,
        'chatbox-ai',
        'claude-sonnet-4-20250514',
        claudeOptions
      )

      expect(second.providerOptionsByModel).toEqual({
        'chatbox-ai:deepseek-v4-pro': deepseekOptions,
        'chatbox-ai:claude-sonnet-4-20250514': claudeOptions,
      })

      const cleared = setReasoningProviderOptionsForModel(
        second,
        'chatbox-ai',
        'deepseek-v4-pro',
        undefined
      )
      expect(cleared.providerOptions).toBeUndefined()
      expect(cleared.providerOptionsByModel).toEqual({ 'chatbox-ai:claude-sonnet-4-20250514': claudeOptions })
      expect(resolveReasoningProviderOptions(cleared, 'chatbox-ai', 'deepseek-v4-pro')).toBeUndefined()
    })

    it('never reads the legacy shared field', () => {
      expect(
        resolveReasoningProviderOptions(
          { providerOptions: claudeOptions },
          ModelProviderEnum.Claude,
          'claude-sonnet-4-5'
        )
      ).toBeUndefined()
      expect(
        resolveReasoningProviderOptions(
          { providerOptions: claudeOptions, providerOptionsByModel: {} },
          ModelProviderEnum.Claude,
          'claude-sonnet-4-5'
        )
      ).toBeUndefined()
      expect(resolveReasoningProviderOptions(undefined, ModelProviderEnum.Claude, 'claude-sonnet-4-5')).toBeUndefined()
    })
  })

  describe('request-edge hardening for cross-model DeepSeek values', () => {
    it('drops enabled Claude thinking without budgetTokens on budget-style models', () => {
      // Shape only the DeepSeek-Anthropic writer produces; real Anthropic budget models
      // reject enabled thinking without budget_tokens.
      expect(
        normalizeClaudeReasoningOptions('claude-sonnet-4-20250514', { thinking: { type: 'enabled' }, effort: 'max' })
      ).toBeUndefined()
      expect(
        normalizeClaudeReasoningOptions('claude-sonnet-4-20250514', {
          thinking: { type: 'enabled', budgetTokens: 1024 },
        })
      ).toEqual({ thinking: { type: 'enabled', budgetTokens: 1024 } })
    })

    it('passes the full effort scale through on Claude effort-style models', () => {
      expect(normalizeClaudeReasoningOptions('claude-opus-4-5', { effort: 'low' })).toEqual({ effort: 'low' })
      expect(normalizeClaudeReasoningOptions('claude-opus-4-5', { effort: 'xhigh' })).toEqual({ effort: 'xhigh' })
      expect(normalizeClaudeReasoningOptions('claude-opus-4-8', { effort: 'max' })).toEqual({ effort: 'max' })
    })

    it('accepts the universal max effort for OpenAI models', () => {
      expect(isOpenAIReasoningEffortSupported('gpt-5.5', 'max')).toBe(true)
      expect(
        normalizeOpenAIReasoningOptions('gpt-5.5', { reasoningEffort: 'max', forceReasoning: true })
      ).toEqual({ reasoningEffort: 'max', forceReasoning: true })
    })
  })
})
