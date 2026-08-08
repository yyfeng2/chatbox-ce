import type { ImageModelGroup } from '@/hooks/useImageModelGroups'

export interface ImageModelSelection {
  provider: string
  model: string
}

export function resolveImageModelSelection(
  modelGroups: ImageModelGroup[],
  selectedProvider: string,
  selectedModel: string
): ImageModelSelection | null {
  const selectedGroup = modelGroups.find((group) => group.providerId === selectedProvider)
  const selectedOption = selectedGroup?.models.find((model) => model.modelId === selectedModel)
  if (selectedOption) {
    return { provider: selectedProvider, model: selectedModel }
  }

  const firstGroup = modelGroups.find((group) => group.models.length > 0)
  const firstModel = firstGroup?.models[0]
  return firstGroup && firstModel ? { provider: firstGroup.providerId, model: firstModel.modelId } : null
}
