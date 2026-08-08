import { Text, TextInput, UnstyledButton } from '@mantine/core'
import {
  createSpotlight,
  Spotlight,
  type SpotlightActionData,
  type SpotlightActionGroupData,
  useSpotlight,
} from '@mantine/spotlight'
import type { BuiltinProviderBaseInfo } from '@shared/types'
import { IconFileImport, IconSearch, IconSquareRoundedPlusFilled } from '@tabler/icons-react'
import { type FC, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Drawer } from 'vaul'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import platform from '@/platform'
import classes from './ProviderSpotlight.module.css'
import { FEATURED_PROVIDER_IDS, ProviderIconImage } from './providerIcons'

export const [providerSpotlightStore, providerSpotlight] = createSpotlight()

type ProviderPickerProps = {
  allSystemProviders: BuiltinProviderBaseInfo[]
  onSelectProvider: (providerId: string) => void
  onAddCustomProvider: () => void
  onImportProvider: () => void
  isImporting: boolean
}

type PickerAction = {
  id: string
  label: string
  description?: string
  leftSection: ReactNode
  onSelect: () => void
}

type PickerGroup = {
  group: string
  actions: PickerAction[]
}

function useProviderPickerGroups({
  allSystemProviders,
  onSelectProvider,
  onAddCustomProvider,
  onImportProvider,
  isImporting,
}: ProviderPickerProps): PickerGroup[] {
  const { t } = useTranslation()

  return useMemo(() => {
    const featured = allSystemProviders.filter((p) => FEATURED_PROVIDER_IDS.includes(p.id))
    const others = allSystemProviders.filter((p) => !FEATURED_PROVIDER_IDS.includes(p.id))

    const quickActions: PickerAction[] = [
      {
        id: 'add-custom',
        label: String(t('Add Custom Provider')),
        description: String(t('Configure a custom OpenAI-compatible provider')),
        onSelect: () => {
          providerSpotlight.close()
          onAddCustomProvider()
        },
        leftSection: <ScalableIcon icon={IconSquareRoundedPlusFilled} size={24} className="text-chatbox-tint-brand" />,
      },
    ]

    if (platform.type !== 'mobile') {
      quickActions.push({
        id: 'import-clipboard',
        label: isImporting ? String(t('Importing...')) : String(t('Import from clipboard')),
        description: String(t('Import provider config from clipboard')),
        onSelect: () => {
          if (isImporting) return
          providerSpotlight.close()
          onImportProvider()
        },
        leftSection: <ScalableIcon icon={IconFileImport} size={24} className="text-chatbox-tint-brand" />,
      })
    }

    return [
      {
        group: String(t('Popular')),
        actions: featured.map((p) => ({
          id: `provider-${p.id}`,
          label: String(t(p.name)),
          onSelect: () => {
            providerSpotlight.close()
            onSelectProvider(p.id)
          },
          leftSection: <ProviderIconImage providerId={p.id} size={24} />,
        })),
      },
      {
        group: String(t('More Providers')),
        actions: others.map((p) => ({
          id: `provider-${p.id}`,
          label: String(t(p.name)),
          onSelect: () => {
            providerSpotlight.close()
            onSelectProvider(p.id)
          },
          leftSection: <ProviderIconImage providerId={p.id} size={24} />,
        })),
      },
      {
        group: String(t('Custom Additions')),
        actions: quickActions,
      },
    ]
  }, [allSystemProviders, onSelectProvider, onAddCustomProvider, onImportProvider, isImporting, t])
}

function toSpotlightActions(groups: PickerGroup[]): SpotlightActionGroupData[] {
  return groups.map((group) => ({
    group: group.group,
    actions: group.actions.map(
      (action): SpotlightActionData => ({
        id: action.id,
        label: action.label,
        description: action.description,
        leftSection: action.leftSection,
        onClick: action.onSelect,
      })
    ),
  }))
}

function filterPickerGroups(query: string, groups: PickerGroup[]): PickerGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups

  return groups
    .map((group) => ({
      ...group,
      actions: group.actions.filter(
        (action) => action.label.toLowerCase().includes(q) || action.description?.toLowerCase().includes(q)
      ),
    }))
    .filter((group) => group.actions.length > 0)
}

/**
 * Mobile: Vaul drawer with a single native overflow scroller.
 * Avoids Mantine Spotlight's nested ScrollArea.Autosize, which breaks touch
 * scrolling in mobile WebViews (especially with the keyboard open).
 */
const MobileProviderPicker: FC<ProviderPickerProps> = (props) => {
  const { t } = useTranslation()
  const { opened } = useSpotlight(providerSpotlightStore)
  const [query, setQuery] = useState('')
  const groups = useProviderPickerGroups(props)
  const filtered = useMemo(() => filterPickerGroups(query, groups), [query, groups])

  useEffect(() => {
    if (!opened) setQuery('')
  }, [opened])

  return (
    <Drawer.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) providerSpotlight.close()
      }}
      noBodyStyles
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[400] bg-chatbox-background-mask-overlay" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[401] flex max-h-[min(85dvh,720px)] flex-col overflow-hidden rounded-t-lg bg-chatbox-background-primary outline-none">
          <Drawer.Handle className="mx-auto mt-2 mb-1 shrink-0" />

          <div className="shrink-0 border-0 border-b border-solid border-chatbox-border-primary px-3 pb-2 pt-1">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={String(t('Search providers...'))}
              leftSection={<ScalableIcon icon={IconSearch} size={18} stroke={1.5} />}
              autoFocus
              size="md"
              variant="filled"
              classNames={{ input: 'bg-chatbox-background-secondary' }}
            />
          </div>

          {/*
            Single scroll container only (no nested ScrollArea). Bound height with an
            explicit maxHeight — flex-1 alone stretches the drawer to full max-h and
            makes list pans fight vaul's drag-to-dismiss.
          */}
          <div
            className="overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2"
            style={{
              WebkitOverflowScrolling: 'touch',
              maxHeight: 'calc(min(85dvh, 720px) - 7.5rem)',
            }}
          >
            {filtered.length === 0 ? (
              <Text c="chatbox-tertiary" size="sm" ta="center" py="lg">
                {t('Nothing found...')}
              </Text>
            ) : (
              filtered.map((group) => (
                <div key={group.group} className="mb-3">
                  <Text size="xs" c="chatbox-tertiary" px="xs" mb={6} className="uppercase tracking-wide">
                    {group.group}
                  </Text>
                  <div className="flex flex-col gap-0.5">
                    {group.actions.map((action) => (
                      <UnstyledButton
                        key={action.id}
                        onClick={action.onSelect}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-chatbox-tint-primary active:bg-chatbox-background-gray-secondary"
                      >
                        <span className="flex shrink-0 items-center justify-center">{action.leftSection}</span>
                        <span className="min-w-0 flex-1">
                          <Text size="sm" className="truncate">
                            {action.label}
                          </Text>
                          {action.description ? (
                            <Text size="xs" c="chatbox-tertiary" className="truncate">
                              {action.description}
                            </Text>
                          ) : null}
                        </span>
                      </UnstyledButton>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="h-[var(--mobile-safe-area-inset-bottom)] min-h-3 shrink-0" />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const DesktopProviderSpotlight: FC<ProviderPickerProps> = (props) => {
  const { t } = useTranslation()
  const groups = useProviderPickerGroups(props)
  const actions = useMemo(() => toSpotlightActions(groups), [groups])

  return (
    <Spotlight
      store={providerSpotlightStore}
      actions={actions}
      nothingFound={String(t('Nothing found...'))}
      scrollable
      maxHeight="min(600px, calc(100dvh - 180px))"
      shortcut={null}
      classNames={{ actionsList: classes.actionsList }}
      searchProps={{
        leftSection: <ScalableIcon icon={IconSearch} size={20} stroke={1.5} />,
        placeholder: String(t('Search providers...')),
      }}
    />
  )
}

const ProviderSpotlight: FC<ProviderPickerProps> = (props) => {
  const isSmallScreen = useIsSmallScreen()
  return isSmallScreen ? <MobileProviderPicker {...props} /> : <DesktopProviderSpotlight {...props} />
}

export default ProviderSpotlight
