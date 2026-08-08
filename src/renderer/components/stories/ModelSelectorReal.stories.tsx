import { Box, Button, Combobox, Group, Paper, Stack, Text } from '@mantine/core'
import { ModelProviderEnum, type ProviderModelInfo } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { settingsStore } from '@/stores/settingsStore'
import { ModelSelector } from '../ModelSelector'
import { DesktopModelSelector } from '../ModelSelector/DesktopModelSelector'
import { MobileModelSelector } from '../ModelSelector/MobileModelSelector'
import { ProviderHeader } from '../ModelSelector/ProviderHeader'
import { ModelItem, ModelItemInDrawer } from '../ModelSelector/shared'

const openAIModels: ProviderModelInfo[] = [
  {
    modelId: 'gpt-4.1',
    nickname: 'GPT-4.1',
    labels: ['recommended', 'new'],
    capabilities: ['vision', 'tool_use'],
    contextWindow: 1_000_000,
  },
  {
    modelId: 'o3',
    nickname: 'o3',
    labels: ['pro'],
    capabilities: ['reasoning', 'tool_use'],
    contextWindow: 200_000,
  },
  {
    modelId: 'text-embedding-3-large',
    nickname: 'Text Embedding 3 Large',
    type: 'embedding',
  },
]

const claudeModels: ProviderModelInfo[] = [
  {
    modelId: 'claude-sonnet-4-20250514',
    nickname: 'Claude Sonnet 4',
    labels: ['recommended'],
    capabilities: ['vision', 'reasoning', 'tool_use'],
    contextWindow: 200_000,
  },
  {
    modelId: 'claude-haiku-3.5',
    nickname: 'Claude Haiku 3.5',
    capabilities: ['vision'],
    contextWindow: 200_000,
  },
]

const customModels: ProviderModelInfo[] = [
  {
    modelId: 'local-agent-32b',
    nickname: 'Local Agent 32B',
    capabilities: ['tool_use'],
    contextWindow: 64_000,
  },
]

const filteredProviders = [
  {
    id: ModelProviderEnum.OpenAI,
    name: 'OpenAI',
    models: openAIModels.filter((model) => model.type !== 'embedding'),
  },
  {
    id: ModelProviderEnum.Claude,
    name: 'Claude',
    models: claudeModels,
  },
  {
    id: 'custom-provider',
    name: 'Local Gateway',
    isCustom: true,
    models: customModels,
  },
]

const meta: Meta = {
  title: 'Real Components/Model Selector',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <SeededProviderSettings>
          <Box p="lg" bg="var(--chatbox-background-primary)" style={{ maxWidth: 820, minHeight: 520 }}>
            <Story />
          </Box>
        </SeededProviderSettings>
      </QueryClientProvider>
    ),
  ],
}

export default meta

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

export const ModelSelectorDropdownStates: StoryObj = {
  name: 'Model selector dropdown with configured providers',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/ModelSelector/index',
      'src/renderer/components/ModelSelector/DesktopModelSelector',
    ],
  },
  render: () => <ModelSelectorFixture />,
}

export const DesktopModelSelectorStates: StoryObj = {
  name: 'Desktop model selector all favorite search disabled states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/ModelSelector/DesktopModelSelector'],
  },
  render: () => <DesktopSelectorFixture />,
}

export const MobileModelSelectorStates: StoryObj = {
  name: 'Mobile model selector drawer states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/ModelSelector/MobileModelSelector'],
  },
  render: () => <MobileSelectorFixture />,
}

export const ProviderHeaderStates: StoryObj = {
  name: 'Provider header default favorite mobile custom and collapsed states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/ModelSelector/ProviderHeader'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ProviderHeader"
        description="Actual provider group header used in desktop dropdowns and mobile drawers."
      />
      <Paper withBorder radius="md" p="sm" maw={420}>
        <ProviderHeader
          provider={{ id: ModelProviderEnum.OpenAI, name: 'OpenAI' }}
          modelCount={12}
          onClick={() => undefined}
        />
        <ProviderHeader
          provider={{ id: ModelProviderEnum.Claude, name: 'Claude' }}
          modelCount={5}
          isCollapsed
          onClick={() => undefined}
        />
        <ProviderHeader
          provider={{ id: 'favorite', name: 'Favorite' }}
          variant="favorite"
          showChevron={false}
          showModelCount={false}
        />
        <ProviderHeader provider={{ id: 'custom-provider', name: 'Local Gateway', isCustom: true }} modelCount={1} />
        <ProviderHeader
          provider={{ id: ModelProviderEnum.OpenAI, name: 'OpenAI' }}
          modelCount={12}
          variant="mobile"
          onClick={() => undefined}
        />
      </Paper>
    </Stack>
  ),
}

export const ModelItemStates: StoryObj = {
  name: 'Model item selected favorited disabled capability and drawer states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/ModelSelector/shared'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ModelItem and ModelItemInDrawer"
        description="Actual selectable model rows with recommendation color, badges, capabilities, favorite affordance, selected state, and disabled tooltip state."
      />
      <Group align="flex-start" gap="lg">
        <Paper withBorder radius="md" p="sm" w={380}>
          <Text fw={600} size="sm" mb="xs">
            Desktop dropdown rows
          </Text>
          <Combobox onOptionSubmit={() => undefined}>
            <Combobox.Options>
              <ModelItem
                providerId={ModelProviderEnum.OpenAI}
                model={openAIModels[0]}
                isFavorited
                isSelected
                onToggleFavorited={() => undefined}
              />
              <ModelItem
                providerId={ModelProviderEnum.OpenAI}
                model={openAIModels[1]}
                isFavorited={false}
                onToggleFavorited={() => undefined}
              />
              <ModelItem
                providerId={ModelProviderEnum.Claude}
                providerName="Claude"
                model={claudeModels[0]}
                isFavorited
                hideFavoriteIcon
                disabledReason="Unavailable for this session"
                onToggleFavorited={() => undefined}
              />
            </Combobox.Options>
          </Combobox>
        </Paper>
        <Paper withBorder radius="md" p="sm" w={380}>
          <Text fw={600} size="sm" mb="xs">
            Mobile drawer rows
          </Text>
          <Stack gap={4}>
            <ModelItemInDrawer
              providerId={ModelProviderEnum.OpenAI}
              model={openAIModels[0]}
              isFavorited
              isSelected
              onSelect={() => undefined}
              onToggleFavorited={() => undefined}
            />
            <ModelItemInDrawer
              providerId={ModelProviderEnum.Claude}
              providerName="Claude"
              model={claudeModels[1]}
              isFavorited={false}
              onSelect={() => undefined}
              onToggleFavorited={() => undefined}
            />
            <ModelItemInDrawer
              providerId="custom-provider"
              providerName="Local Gateway"
              model={customModels[0]}
              disabledReason="Tools are disabled for this provider"
              onSelect={() => undefined}
              onToggleFavorited={() => undefined}
            />
          </Stack>
        </Paper>
      </Group>
    </Stack>
  ),
}

function ModelSelectorFixture() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState('openai/gpt-4.1')

  useEffect(() => {
    const timer = window.setTimeout(() => triggerRef.current?.click(), 150)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="ModelSelector"
        description="Actual responsive model selector entry point backed by configured provider settings."
      />
      <Group align="flex-start">
        <ModelSelector
          selectedProviderId={selected.split('/')[0]}
          selectedModelId={selected.split('/')[1]}
          showAuto
          autoText="Auto select"
          onSelect={(provider, model) => setSelected(provider && model ? `${provider}/${model}` : 'auto')}
          modelDisabledCheck={(model) =>
            model.modelId === 'o3' ? 'Reasoning models are disabled in this fixture' : undefined
          }
          withinPortal={false}
        >
          <Button ref={triggerRef} variant="light">
            {selected === 'auto' ? 'Auto select' : selected}
          </Button>
        </ModelSelector>
        <Text size="sm" c="dimmed" maw={280}>
          The dropdown is opened by the real trigger after mount so the story captures the production menu state.
        </Text>
      </Group>
    </Stack>
  )
}

function DesktopSelectorFixture() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [activeTab, setActiveTab] = useState<string | null>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('openai/gpt-4.1')

  useEffect(() => {
    const timer = window.setTimeout(() => triggerRef.current?.click(), 150)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="DesktopModelSelector"
        description="Actual desktop combobox with auto option, favorites, grouped providers, selected row, search, and disabled model state."
      />
      <DesktopModelSelector
        selectedProviderId={selected.split('/')[0]}
        selectedModelId={selected.split('/')[1]}
        showAuto
        autoText="Auto select"
        activeTab={activeTab}
        search={search}
        filteredProviders={filteredProviders}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onOptionSubmit={(val) => setSelected(val || 'auto')}
        modelDisabledCheck={(model) =>
          model.modelId === 'o3' ? 'Reasoning models are disabled in this fixture' : undefined
        }
        comboboxProps={{ withinPortal: false }}
        searchPosition="top"
      >
        <Button ref={triggerRef} variant="light">
          {selected === 'auto' ? 'Auto select' : selected}
        </Button>
      </DesktopModelSelector>
    </Stack>
  )
}

function MobileSelectorFixture() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [activeTab, setActiveTab] = useState<string | null>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('claude/claude-sonnet-4-20250514')

  useEffect(() => {
    const timer = window.setTimeout(() => triggerRef.current?.click(), 150)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="MobileModelSelector"
        description="Actual mobile drawer with tabs, search, auto row, grouped providers, selected row, favorite state, and disabled model state."
      />
      <MobileModelSelector
        selectedProviderId={selected.split('/')[0]}
        selectedModelId={selected.split('/')[1]}
        showAuto
        autoText="Auto select"
        activeTab={activeTab}
        search={search}
        filteredProviders={filteredProviders}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onOptionSubmit={(val) => setSelected(val || 'auto')}
        modelDisabledCheck={(model) =>
          model.modelId === 'o3' ? 'Reasoning models are disabled in this fixture' : undefined
        }
      >
        <Button ref={triggerRef} variant="light">
          Open mobile selector
        </Button>
      </MobileModelSelector>
    </Stack>
  )
}

function SeededProviderSettings({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    settingsStore.setState({
      providers: {
        [ModelProviderEnum.OpenAI]: {
          apiKey: 'storybook-openai-key',
          models: openAIModels,
        },
        [ModelProviderEnum.Claude]: {
          apiKey: 'storybook-claude-key',
          models: claudeModels,
        },
        'custom-provider': {
          apiKey: 'storybook-local-key',
          models: customModels,
        },
      },
      customProviders: [
        {
          id: 'custom-provider',
          name: 'Local Gateway',
          type: 'openai',
          isCustom: true,
        },
      ],
      favoritedModels: [
        { provider: ModelProviderEnum.OpenAI, model: 'gpt-4.1' },
        { provider: ModelProviderEnum.Claude, model: 'claude-sonnet-4-20250514' },
      ],
    })
  }, [])

  return children
}

function SurfaceLabel({ title, description }: { title: string; description: string }) {
  return (
    <Box>
      <Text fw={700}>{title}</Text>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Box>
  )
}
