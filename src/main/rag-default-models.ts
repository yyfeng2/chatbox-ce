import type { Settings } from '@shared/types'

type ModelSelection = {
  provider: string
  model: string
}

export function toRagModelString(selection?: ModelSelection): string | undefined {
  if (!selection?.provider || !selection.model) return undefined
  return `${selection.provider}:${selection.model}`
}

export function getDefaultEmbeddingModelString(settings: Settings): string | undefined {
  return toRagModelString(settings.defaultEmbeddingModel)
}

export function getDefaultRerankModelString(settings: Settings): string | undefined {
  return toRagModelString(settings.defaultRerankModel)
}
