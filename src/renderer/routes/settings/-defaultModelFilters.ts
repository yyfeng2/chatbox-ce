import type { ProviderModelInfo } from '@shared/types'

export function isEmbeddingModel(model: ProviderModelInfo) {
  return model.type === 'embedding'
}

export function isRerankModel(model: ProviderModelInfo) {
  return model.type === 'rerank'
}
