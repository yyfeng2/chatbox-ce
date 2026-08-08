import { describe, expect, it } from 'vitest'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import { resolveImageModelSelection } from './model-selection'

const groups: ImageModelGroup[] = [
  {
    label: 'OpenAI',
    providerId: 'openai',
    models: [{ modelId: 'gpt-image-2', displayName: 'GPT Image 2' }],
  },
]

describe('resolveImageModelSelection', () => {
  it('clears the selection when no image models remain', () => {
    expect(resolveImageModelSelection([], 'openai', 'gpt-image-2')).toBeNull()
  })

  it('keeps a selection that is still available', () => {
    expect(resolveImageModelSelection(groups, 'openai', 'gpt-image-2')).toEqual({
      provider: 'openai',
      model: 'gpt-image-2',
    })
  })

  it('falls back to the first available model when the selection disappears', () => {
    expect(resolveImageModelSelection(groups, 'missing-provider', 'missing-model')).toEqual({
      provider: 'openai',
      model: 'gpt-image-2',
    })
  })
})
