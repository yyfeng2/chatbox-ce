import { describe, expect, test } from 'vitest'
import { settings as defaultSettings } from '../defaults'
import { SessionSettingsSchema, SettingsSchema } from './settings'

describe('SettingsSchema RAG default models', () => {
  test('parses default embedding and rerank model selections', () => {
    const parsed = SettingsSchema.parse({
      ...defaultSettings(),
      defaultEmbeddingModel: {
        provider: 'openai',
        model: 'text-embedding-3-small',
      },
      defaultRerankModel: {
        provider: 'cohere',
        model: 'rerank-v3.5',
      },
    })

    expect(parsed.defaultEmbeddingModel).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-small',
    })
    expect(parsed.defaultRerankModel).toEqual({
      provider: 'cohere',
      model: 'rerank-v3.5',
    })
  })

  test('defaults leave RAG model fallbacks unset', () => {
    const parsed = SettingsSchema.parse(defaultSettings())

    expect(parsed.defaultEmbeddingModel).toBeUndefined()
    expect(parsed.defaultRerankModel).toBeUndefined()
  })
})

describe('SettingsSchema background image opacity', () => {
  test('uses the original opacity for existing settings', () => {
    const legacySettings: Record<string, unknown> = { ...defaultSettings() }
    delete legacySettings.backgroundImageOpacity

    expect(SettingsSchema.parse(legacySettings).backgroundImageOpacity).toBe(0.16)
  })
})

describe('SettingsSchema shortcut compatibility', () => {
  test('adds the new thread shortcut when loading settings without the historical key', () => {
    const shortcuts: Record<string, unknown> = { ...defaultSettings().shortcuts }
    delete shortcuts.messageListRefreshContext

    const parsed = SettingsSchema.parse({
      ...defaultSettings(),
      shortcuts,
    })

    expect(parsed.shortcuts.messageListRefreshContext).toBe('mod+shift+n')
  })

  test('migrates the removed cmd+r shortcut to cmd+shift+n', () => {
    const parsed = SettingsSchema.parse({
      ...defaultSettings(),
      shortcuts: {
        ...defaultSettings().shortcuts,
        messageListRefreshContext: 'mod+r',
      },
    })

    expect(parsed.shortcuts.messageListRefreshContext).toBe('mod+shift+n')
  })

  test('moves the old image creator shortcut away from cmd+shift+n', () => {
    const parsed = SettingsSchema.parse({
      ...defaultSettings(),
      shortcuts: {
        ...defaultSettings().shortcuts,
        newPictureChat: 'mod+shift+n',
      },
    })

    expect(parsed.shortcuts.newPictureChat).toBe('')
  })
})

describe('SessionSettingsSchema per-model provider options', () => {
  test('parses the per-model map alongside the legacy shared field', () => {
    const parsed = SessionSettingsSchema.parse({
      provider: 'chatbox-ai',
      modelId: 'deepseek-v4-pro',
      providerOptions: { deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'max' } },
      providerOptionsByModel: {
        'chatbox-ai:deepseek-v4-pro': { claude: { thinking: { type: 'enabled' }, effort: 'max' } },
        'chatbox-ai:claude-sonnet-4-20250514': { claude: { thinking: { type: 'enabled', budgetTokens: 4096 } } },
      },
    })

    expect(parsed.providerOptionsByModel?.['chatbox-ai:deepseek-v4-pro']?.claude?.effort).toBe('max')
    expect(parsed.providerOptionsByModel?.['chatbox-ai:claude-sonnet-4-20250514']?.claude?.thinking?.budgetTokens).toBe(
      4096
    )
  })

  test('drops an invalid map without failing the whole settings parse', () => {
    const parsed = SessionSettingsSchema.parse({
      provider: 'chatbox-ai',
      providerOptionsByModel: 'not-a-map',
    })

    expect(parsed.providerOptionsByModel).toBeUndefined()
    expect(parsed.provider).toBe('chatbox-ai')
  })
})
