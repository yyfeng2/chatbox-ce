import type { ComboboxProps } from '@mantine/core'
import type { ModelProvider, ProviderModelInfo } from '@shared/types'
import { forwardRef, type PropsWithChildren, useMemo, useState } from 'react'
import { useProviders } from '@/hooks/useProviders'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { DesktopModelSelector } from './DesktopModelSelector'
import { MobileModelSelector } from './MobileModelSelector'
import { filterModelsForSelector } from './filterModels'

export type { FavoriteModel } from './shared'
// Re-export shared components and utilities
export { groupFavoriteModels, ModelItem, ModelItemInDrawer, SELECTED_BG_CLASS, TRANSITION_DURATION } from './shared'

export type ModelSelectorProps = PropsWithChildren<
  {
    showAuto?: boolean
    autoText?: string
    onSelect?: (provider: ModelProvider | string, model: string) => void
    onDropdownOpen?: () => void
    modelFilter?: (model: ProviderModelInfo, providerId?: string) => boolean
    modelDisabledCheck?: (model: ProviderModelInfo, providerId?: string) => string | undefined
    selectedProviderId?: string
    selectedModelId?: string
    searchPosition?: 'top' | 'bottom'
  } & ComboboxProps
>

export const ModelSelector = forwardRef<HTMLDivElement, ModelSelectorProps>(
  (
    {
      showAuto,
      autoText,
      onSelect,
      onDropdownOpen,
      children,
      modelFilter,
      modelDisabledCheck,
      selectedProviderId,
      selectedModelId,
      searchPosition = 'bottom',
      ...comboboxProps
    },
    ref
  ) => {
    const { providers, isFavoritedModel } = useProviders()
    const [activeTab, setActiveTab] = useState<string | null>('all')
    const [search, setSearch] = useState('')

    const filteredProviders = useMemo(() => {
      const filtered = providers.map((provider) => {
        const models = filterModelsForSelector(provider.models, modelFilter, provider.id)?.filter(
          (model) =>
            provider.id.toLowerCase().includes(search.toLowerCase()) ||
            provider.name.toLowerCase().includes(search.toLowerCase()) ||
            model.nickname?.toLowerCase().includes(search.toLowerCase()) ||
            model.modelId?.toLowerCase().includes(search.toLowerCase())
        )
        return {
          ...provider,
          models,
        }
      })

      return filtered
    }, [providers, search, modelFilter, activeTab, isFavoritedModel])

    const handleOptionSubmit = (val: string) => {
      if (!val) {
        onSelect?.('', '')
      } else {
        const selectedProvider = providers.find((p) =>
          (p.models || p.defaultSettings?.models)?.find((m) => val === `${p.id}/${m.modelId}`)
        )
        const selectedModel = (selectedProvider?.models || selectedProvider?.defaultSettings?.models)?.find(
          (m) => val === `${selectedProvider.id}/${m.modelId}`
        )

        if (selectedProvider && selectedModel) {
          onSelect?.(selectedProvider.id, selectedModel.modelId)
        }
      }
    }

    const isSmallScreen = useIsSmallScreen()

    return isSmallScreen ? (
      <MobileModelSelector
        ref={ref}
        showAuto={showAuto}
        autoText={autoText}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        activeTab={activeTab}
        search={search}
        filteredProviders={filteredProviders}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onOptionSubmit={handleOptionSubmit}
        modelFilter={modelFilter}
        modelDisabledCheck={modelDisabledCheck}
      >
        {children}
      </MobileModelSelector>
    ) : (
      <DesktopModelSelector
        ref={ref}
        showAuto={showAuto}
        autoText={autoText}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        activeTab={activeTab}
        search={search}
        filteredProviders={filteredProviders}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onOptionSubmit={handleOptionSubmit}
        onDropdownOpen={onDropdownOpen}
        modelFilter={modelFilter}
        modelDisabledCheck={modelDisabledCheck}
        comboboxProps={comboboxProps}
        searchPosition={searchPosition}
      >
        {children}
      </DesktopModelSelector>
    )
  }
)

export default ModelSelector
