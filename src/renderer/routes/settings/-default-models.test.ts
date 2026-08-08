import { describe, expect, test } from 'vitest'
import { isEmbeddingModel, isRerankModel } from './-defaultModelFilters'

describe('default model route model filters', () => {
  test('accepts only embedding models for the default embedding selector', () => {
    expect(isEmbeddingModel({ modelId: 'text-embedding-3-small', type: 'embedding' })).toBe(true)
    expect(isEmbeddingModel({ modelId: 'deepseek-v4-flash', type: 'chat' })).toBe(false)
    expect(isEmbeddingModel({ modelId: 'legacy-model' })).toBe(false)
  })

  test('accepts only rerank models for the default reranking selector', () => {
    expect(isRerankModel({ modelId: 'rerank-v3.5', type: 'rerank' })).toBe(true)
    expect(isRerankModel({ modelId: 'deepseek-v4-flash', type: 'chat' })).toBe(false)
    expect(isRerankModel({ modelId: 'legacy-model' })).toBe(false)
  })
})
