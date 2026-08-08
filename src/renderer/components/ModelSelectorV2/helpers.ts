import type { ProviderModelInfo } from '@shared/types'
import type { FavoriteModel, FilteredProvider } from './types'

export function modelMatchesSearch(
  model: { modelId: string; modelName?: string },
  search: string,
  providerName = ''
): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  return (
    providerName.toLowerCase().includes(query) ||
    model.modelId.toLowerCase().includes(query) ||
    (model.modelName || '').toLowerCase().includes(query)
  )
}

export function groupFavorites(favorites: FavoriteModel[] | undefined) {
  return (favorites || []).reduce(
    (acc, favorite) => {
      const providerId = favorite.provider?.id || 'unknown'
      if (!acc[providerId]) {
        acc[providerId] = { provider: favorite.provider, models: [] }
      }
      acc[providerId].models.push(favorite)
      return acc
    },
    {} as Record<string, { provider: FavoriteModel['provider']; models: FavoriteModel[] }>
  )
}

export function searchGenericModel(provider: FilteredProvider, model: ProviderModelInfo, search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return true
  return (
    provider.id.toLowerCase().includes(query) ||
    provider.name.toLowerCase().includes(query) ||
    model.modelId.toLowerCase().includes(query) ||
    (model.nickname || '').toLowerCase().includes(query)
  )
}

export function getCostLevelBarCount(costLevel: string | undefined) {
  const normalizedCostLevel = costLevel?.toLowerCase()
  if (normalizedCostLevel === 'high') return 3
  if (normalizedCostLevel === 'medium') return 2
  return 1
}

export function getCostLabel(costLevel: string | undefined, t: (key: string) => string) {
  return getCostLevelBarCount(costLevel) > 1 ? t('Consumes more token') : ''
}
