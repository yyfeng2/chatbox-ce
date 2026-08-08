import { describe, expect, it } from 'vitest'
import { transformModelEntry } from './transform'
import type { ModelsDevModelEntry } from './types'

function modelsDevEntry(id: string, reasoning = true): ModelsDevModelEntry {
  return {
    id,
    name: id,
    family: 'gpt',
    reasoning,
    tool_call: true,
    structured_output: true,
    open_weights: false,
    modalities: { input: ['text'], output: ['text'] },
    limit: { context: 128_000, output: 16_384 },
    cost: { input: 1, output: 10 },
    release_date: '2026-01-01',
  }
}

describe('transformModelEntry', () => {
  it.each(['gpt-5-chat-latest', 'gpt-5.1-chat-latest', 'openai/gpt-5.2-chat'])(
    'removes incorrect reasoning metadata from %s',
    (modelId) => {
      expect(transformModelEntry(modelsDevEntry(modelId)).capabilities).toEqual(['tool_use'])
    }
  )

  it('keeps reasoning metadata for actual GPT-5 reasoning models', () => {
    expect(transformModelEntry(modelsDevEntry('gpt-5.2')).capabilities).toEqual(['tool_use', 'reasoning'])
  })
})
