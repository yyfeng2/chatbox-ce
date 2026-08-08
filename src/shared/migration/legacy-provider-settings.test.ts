import { describe, expect, it } from 'vitest'
import { ModelProviderEnum } from '../types'
import { LEGACY_PROVIDER_MODEL_KEYS, migrateLegacyProviderSettings } from './legacy-provider-settings'

describe('migrateLegacyProviderSettings', () => {
  it('maps flat per-provider keys into the providers map', () => {
    const { providers } = migrateLegacyProviderSettings({
      openaiKey: 'sk-openai',
      apiHost: 'https://openai.test',
      claudeApiKey: 'sk-claude',
      geminiAPIKey: 'sk-gemini',
      deepseekAPIKey: 'sk-deepseek',
      ollamaHost: 'http://localhost:11434',
    })

    expect(providers[ModelProviderEnum.OpenAI]).toMatchObject({ apiKey: 'sk-openai', apiHost: 'https://openai.test' })
    expect(providers[ModelProviderEnum.Claude]).toMatchObject({ apiKey: 'sk-claude' })
    expect(providers[ModelProviderEnum.Gemini]).toMatchObject({ apiKey: 'sk-gemini' })
    expect(providers[ModelProviderEnum.DeepSeek]).toMatchObject({ apiKey: 'sk-deepseek' })
    expect(providers[ModelProviderEnum.Ollama]).toMatchObject({ apiHost: 'http://localhost:11434' })
  })

  it('omits providers that have no legacy credentials', () => {
    const { providers } = migrateLegacyProviderSettings({ openaiKey: 'sk-openai' })
    expect(providers[ModelProviderEnum.Claude]).toBeUndefined()
    expect(providers[ModelProviderEnum.Gemini]).toBeUndefined()
  })

  it('migrates custom providers into id-keyed entries', () => {
    const { providers, customProviders } = migrateLegacyProviderSettings({
      customProviders: [{ name: 'My Proxy', key: 'k', host: 'https://proxy.test', modelOptions: ['m1', 'm2'] }],
    })

    expect(customProviders).toHaveLength(1)
    expect(customProviders[0]).toMatchObject({ name: 'My Proxy', isCustom: true })
    const entry = providers[customProviders[0].id]
    expect(entry).toMatchObject({ apiKey: 'k', apiHost: 'https://proxy.test' })
    expect(entry?.models?.map((m) => m.modelId)).toEqual(['m1', 'm2'])
  })

  it('returns empty structures for empty input', () => {
    expect(migrateLegacyProviderSettings({})).toEqual({ providers: {}, customProviders: [] })
  })

  it('exposes the legacy provider→model-key mapping', () => {
    expect(LEGACY_PROVIDER_MODEL_KEYS[ModelProviderEnum.Claude]).toBe('claudeModel')
    expect(LEGACY_PROVIDER_MODEL_KEYS[ModelProviderEnum.OpenAI]).toBe('model')
  })
})
