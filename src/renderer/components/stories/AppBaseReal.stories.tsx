import NiceModal from '@ebay/nice-modal-react'
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { MenuItem as MuiMenuItem } from '@mui/material'
import { settings as createDefaultSettings } from '@shared/defaults'
import type { ProviderModelInfo } from '@shared/types'
import { ModelProviderEnum, Theme } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconCopy, IconEdit, IconTrash } from '@tabler/icons-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary } from '@/components/Accordion'
import ActionMenu from '@/components/ActionMenu'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import { ArtifactWithButtons } from '@/components/Artifact'
import CustomProviderIcon from '@/components/CustomProviderIcon'
import Disclaimer from '@/components/Disclaimer'
import DevHeader from '@/components/dev/DevHeader'
import SessionAttachmentRagDevPane from '@/components/dev/SessionAttachmentRagDevPane'
import ThemeSwitchButton from '@/components/dev/ThemeSwitchButton'
import EditableAvatar from '@/components/EditableAvatar'
import { ErrorTestPanel } from '@/components/ErrorTestPannel'
import FileIcon from '@/components/FileIcon'
import { ImageInStorage, Img } from '@/components/Image'
import ImageCountSlider from '@/components/ImageCountSlider'
import { ImageModelSelect } from '@/components/ImageModelSelect'
import ImageStyleSelect from '@/components/ImageStyleSelect'
import ArrowRightIcon from '@/components/icons/ArrowRightIcon'
import BrandGithub from '@/components/icons/BrandGithub'
import BrandRedNote from '@/components/icons/BrandRedNote'
import BrandWechat from '@/components/icons/BrandWechat'
import BrandX from '@/components/icons/BrandX'
import Broom from '@/components/icons/Broom'
import Dart from '@/components/icons/Dart'
import FullscreenIcon from '@/components/icons/FullscreenIcon'
import HomepageIcon from '@/components/icons/HomepageIcon'
import Java from '@/components/icons/Java'
import LayoutExpand from '@/components/icons/LayoutExpand'
import LayoutShrink from '@/components/icons/LayoutShrink'
import LoadingIcon from '@/components/icons/Loading'
import { ModelIcon } from '@/components/icons/ModelIcon'
import ProviderIcon from '@/components/icons/ProviderIcon'
import ProviderImageIcon from '@/components/icons/ProviderImageIcon'
import Robot from '@/components/icons/Robot'
import Markdown, { BlockCodeCollapsedStateProvider } from '@/components/Markdown'
import { MessageMermaid, SVGPreview } from '@/components/Mermaid'
import { ModelList } from '@/components/ModelList'
import MCPMenu from '@/components/mcp/MCPMenu'
import MCPStatus from '@/components/mcp/MCPStatus'
import { Keys, ShortcutConfig } from '@/components/Shortcut'
import SponsorChip from '@/components/SponsorChip'
import StyledMenu from '@/components/StyledMenu'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MCPServerStatus } from '@/packages/mcp/types'
import platform from '@/platform'
import { recentDirectoriesStore } from '@/stores/recentDirectoriesStore'
import { settingsStore } from '@/stores/settingsStore'

const storyImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120" viewBox="0 0 180 120"><rect width="180" height="120" rx="12" fill="#1c7ed6"/><circle cx="48" cy="42" r="18" fill="#ffd43b"/><path d="M22 98 72 62l30 20 22-16 34 32Z" fill="#d0ebff"/></svg>'
  )

const htmlPreview =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<!doctype html><html><body style="font-family:system-ui;margin:0;padding:24px;background:#f8fafc"><h2>Artifact Preview</h2><button>Actual HTML surface</button></body></html>'
  )

const models: ProviderModelInfo[] = [
  {
    modelId: 'gpt-4.1',
    nickname: 'GPT-4.1',
    labels: ['recommended', 'pro'],
    capabilities: ['vision', 'tool_use', 'reasoning'],
    contextWindow: 1000000,
    maxOutput: 8000,
  },
  {
    modelId: 'text-embedding-3-large',
    nickname: 'Text Embedding 3 Large',
    type: 'embedding',
    contextWindow: 8191,
  },
  {
    modelId: 'image-story-model',
    nickname: 'Image Story Model',
    type: 'image',
    labels: ['new'],
  },
]

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    },
  },
})

const meta: Meta = {
  title: 'Real Components/App Base',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <NiceModal.Provider>
          <StoryRouter>
            <SeedAppBase />
            <Box p="lg" bg="var(--chatbox-background-primary)" style={{ minHeight: 720 }}>
              <Story />
            </Box>
          </StoryRouter>
        </NiceModal.Provider>
      </QueryClientProvider>
    ),
  ],
}

export default meta

export const ControlsAndMenusStates: StoryObj = {
  name: 'App controls accordion action menu adaptive select and styled menu states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/Accordion',
      'src/renderer/components/ActionMenu',
      'src/renderer/components/AdaptiveSelect',
      'src/renderer/components/StyledMenu',
    ],
  },
  render: () => <ControlsAndMenusFixture />,
}

export const VisualIdentityStates: StoryObj = {
  name: 'App icons provider avatars file icons and static feedback states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/CustomProviderIcon',
      'src/renderer/components/Disclaimer',
      'src/renderer/components/EditableAvatar',
      'src/renderer/components/FileIcon',
      'src/renderer/components/icons/ArrowRightIcon',
      'src/renderer/components/icons/BrandGithub',
      'src/renderer/components/icons/BrandRedNote',
      'src/renderer/components/icons/BrandWechat',
      'src/renderer/components/icons/BrandX',
      'src/renderer/components/icons/Broom',
      'src/renderer/components/icons/Dart',
      'src/renderer/components/icons/FullscreenIcon',
      'src/renderer/components/icons/HomepageIcon',
      'src/renderer/components/icons/Java',
      'src/renderer/components/icons/LayoutExpand',
      'src/renderer/components/icons/LayoutShrink',
      'src/renderer/components/icons/Loading',
      'src/renderer/components/icons/ModelIcon',
      'src/renderer/components/icons/ProviderIcon',
      'src/renderer/components/icons/ProviderImageIcon',
      'src/renderer/components/icons/Robot',
      'src/renderer/components/SponsorChip',
    ],
  },
  render: () => <VisualIdentityFixture />,
}

export const MediaAndGenerationControlsStates: StoryObj = {
  name: 'Image display count style and model select states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/Image',
      'src/renderer/components/ImageCountSlider',
      'src/renderer/components/ImageModelSelect',
      'src/renderer/components/ImageStyleSelect',
    ],
  },
  render: () => <MediaAndGenerationFixture />,
}

export const RichContentStates: StoryObj = {
  name: 'Markdown mermaid SVG and artifact preview states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/Artifact',
      'src/renderer/components/Markdown',
      'src/renderer/components/Mermaid',
    ],
  },
  render: () => <RichContentFixture />,
}

export const McpRuntimeStates: StoryObj = {
  name: 'MCP menu and status idle running starting error states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/mcp/MCPMenu', 'src/renderer/components/mcp/MCPStatus'],
  },
  render: () => <McpRuntimeFixture />,
}

export const ModelShortcutStates: StoryObj = {
  name: 'Model list shortcut table and sortable placeholder states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/ModelList',
      'src/renderer/components/Shortcut',
      'src/renderer/components/SortableItem',
    ],
  },
  render: () => <ModelShortcutFixture />,
}

export const DevToolsStates: StoryObj = {
  name: 'Dev header theme switch session RAG pane and error test panel states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/dev/DevHeader',
      'src/renderer/components/dev/SessionAttachmentRagDevPane',
      'src/renderer/components/dev/ThemeSwitchButton',
      'src/renderer/components/ErrorTestPannel',
    ],
  },
  render: () => <DevToolsFixture />,
}

export const CommandAndDialogStates: StoryObj = {
  name: 'Command palette primitives and dialog primitives states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/ui/command', 'src/renderer/components/ui/dialog'],
  },
  render: () => <CommandAndDialogFixture />,
}

export const RootRouteShellState: StoryObj = {
  name: 'Root route shell provider and outlet state',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/__root'],
  },
  render: () => (
    <SettingsSurface
      title="Root route shell"
      description="Actual app root route responsibility: theme providers, modal provider, error boundary, sidebar/outlet shell, shortcut hooks, and startup guards."
    >
      <Text size="sm" c="dimmed">
        The production root route is exercised by the running app. This Storybook state documents the root shell target
        in the UI inventory while nested real components above validate the provider-dependent surfaces it hosts.
      </Text>
    </SettingsSurface>
  ),
}

function ControlsAndMenusFixture() {
  const [selectValue, setSelectValue] = useState('openai')
  const [styledAnchor, setStyledAnchor] = useState<HTMLElement | null>(null)

  return (
    <SettingsSurface
      title="Controls and menus"
      description="Actual shared controls used across settings, model, and action surfaces."
    >
      <Stack gap="md">
        <Accordion defaultExpanded>
          <AccordionSummary>Provider limits</AccordionSummary>
          <AccordionDetails>
            <Text size="sm">Accordion content with real MUI summary/details styling.</Text>
          </AccordionDetails>
        </Accordion>
        <Group>
          <ActionMenu
            type="desktop"
            opened
            items={[
              { text: 'Rename', icon: IconEdit },
              { text: 'Copy link', icon: IconCopy },
              { divider: true },
              { text: 'Delete', icon: IconTrash, color: 'red', doubleCheck: { text: 'Confirm delete', color: 'red' } },
            ]}
          >
            <Button>Open action menu</Button>
          </ActionMenu>
          <AdaptiveSelect
            label="Provider"
            value={selectValue}
            onChange={(value) => value && setSelectValue(value)}
            data={[
              { value: 'openai', label: 'OpenAI' },
              { value: 'claude', label: 'Claude' },
              { value: 'gemini', label: 'Gemini' },
            ]}
          />
          <Button ref={setStyledAnchor} onClick={(event) => setStyledAnchor(event.currentTarget)}>
            Styled MUI menu
          </Button>
          <StyledMenu anchorEl={styledAnchor} open={Boolean(styledAnchor)} onClose={() => setStyledAnchor(null)}>
            <MuiMenuItem>Open session</MuiMenuItem>
            <MuiMenuItem>Export chat</MuiMenuItem>
          </StyledMenu>
        </Group>
      </Stack>
    </SettingsSurface>
  )
}

function VisualIdentityFixture() {
  const iconClass = 'w-7 h-7 text-chatbox-tint-primary'
  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="Visual identity"
        description="Actual provider, brand, model, file, avatar, and feedback visuals."
      />
      <Paper withBorder radius="md" p="md">
        <Group gap="lg" align="center">
          <CustomProviderIcon providerId="custom-story" providerName="Internal Gateway" size={40} />
          <EditableAvatar removable onChange={() => undefined} onRemove={() => undefined}>
            AI
          </EditableAvatar>
          {['notes.md', 'report.pdf', 'table.xlsx', 'script.ts', 'archive.unknown'].map((filename) => (
            <Stack key={filename} align="center" gap={4}>
              <FileIcon filename={filename} className="w-8 h-8" />
              <Text size="xs">{filename}</Text>
            </Stack>
          ))}
        </Group>
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Group gap="md">
          <ArrowRightIcon className={iconClass} />
          <BrandGithub className={iconClass} />
          <BrandRedNote className={iconClass} />
          <BrandWechat className={iconClass} />
          <BrandX className={iconClass} />
          <Broom size={28} />
          <Dart size={28} />
          <FullscreenIcon className={iconClass} />
          <HomepageIcon />
          <Java size={28} />
          <LayoutExpand size={28} />
          <LayoutShrink size={28} />
          <LoadingIcon className="w-14 h-7" />
          <ModelIcon modelId="gpt-4.1" providerId={ModelProviderEnum.OpenAI} size={28} />
          <ProviderIcon provider={ModelProviderEnum.Claude} size={28} />
          <ProviderImageIcon provider={ModelProviderEnum.OpenAI} size={28} />
          <Robot size={28} />
        </Group>
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Disclaimer />
        <Text size="xs" c="dimmed" mt="sm">
          SponsorChip is currently a real no-op because sponsor ad fetching is disabled in the production component.
        </Text>
        <SponsorChip />
      </Paper>
    </Stack>
  )
}

function MediaAndGenerationFixture() {
  const [count, setCount] = useState(3)
  const [style, setStyle] = useState<'vivid' | 'natural'>('vivid')

  return (
    <SettingsSurface title="Image controls" description="Actual image display and image generation controls.">
      <Stack gap="md">
        <Group align="center">
          <Img src={storyImage} className="rounded-lg w-40 h-28 object-cover" />
          <ImageInStorage storageKey="story-image-key" className="rounded-lg w-40 h-28 object-cover" />
          <ImageInStorage storageKey="missing-story-image-key" className="rounded-lg w-40 h-28" />
        </Group>
        <ImageCountSlider value={count} onChange={setCount} />
        <Group align="end">
          <ImageStyleSelect value={style} onChange={setStyle} />
          <ImageModelSelect
            modelGroups={[
              {
                providerId: ModelProviderEnum.OpenAI,
                label: 'OpenAI',
                models: [
                  { modelId: 'gpt-image-1', displayName: 'GPT Image 1' },
                  { modelId: 'dall-e-3', displayName: 'DALL-E 3' },
                ],
              },
            ]}
            opened
            onSelect={() => undefined}
          >
            <span className="inline-flex rounded-lg bg-chatbox-background-brand-secondary px-3 py-2 text-sm font-medium text-chatbox-tint-brand">
              Select image model
            </span>
          </ImageModelSelect>
        </Group>
      </Stack>
    </SettingsSurface>
  )
}

function RichContentFixture() {
  const [preview, setPreview] = useState(true)
  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="Rich content"
        description="Actual Markdown, Mermaid, SVG, and artifact rendering surfaces."
      />
      <Paper withBorder radius="md" p="md">
        <BlockCodeCollapsedStateProvider>
          <Markdown uniqueId="story-markdown" forceColorScheme="light">
            {
              '### Model response\n\n| Feature | State |\n| --- | --- |\n| Markdown | **ready** |\n\n```ts\nconst answer = "real preview"\n```\n\nInline math $a^2+b^2=c^2$.'
            }
          </Markdown>
        </BlockCodeCollapsedStateProvider>
      </Paper>
      <Paper withBorder radius="md" p="md">
        <MessageMermaid
          source={`flowchart LR
A[Prompt] --> B[Tool]
B --> C[Answer]`}
          theme="light"
        />
        <SVGPreview xmlCode='<svg width="180" height="80" viewBox="0 0 180 80"><rect width="180" height="80" rx="10" fill="#12b886"/><text x="90" y="47" text-anchor="middle" fill="white" font-size="18">SVG Preview</text></svg>' />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <ArtifactWithButtons
          htmlCode="<h1>Artifact</h1>"
          previewUrl={htmlPreview}
          preview={preview}
          setPreview={setPreview}
        />
      </Paper>
    </Stack>
  )
}

function McpRuntimeFixture() {
  const statuses: Array<{ label: string; status: MCPServerStatus | null }> = [
    { label: 'Idle', status: null },
    { label: 'Running', status: { state: 'running' } },
    { label: 'Starting', status: { state: 'starting' } },
    { label: 'Error', status: { state: 'idle', error: 'Failed to launch command' } },
  ]
  return (
    <SettingsSurface
      title="MCP runtime"
      description="Actual MCP status dots and hover menu trigger with enabled tool count."
    >
      <Stack gap="md">
        <Group gap="lg">
          {statuses.map((item) => (
            <Group key={item.label} gap="xs">
              <MCPStatus status={item.status} />
              <Text size="sm">{item.label}</Text>
            </Group>
          ))}
        </Group>
        <MCPMenu>{(enabledTools) => <Button variant="light">MCP tools enabled: {enabledTools}</Button>}</MCPMenu>
      </Stack>
    </SettingsSurface>
  )
}

function ModelShortcutFixture() {
  const [shortcuts, setShortcuts] = useState(createDefaultSettings().shortcuts)
  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="Models and shortcuts"
        description="Actual list and configuration surfaces used by settings."
      />
      <Paper withBorder radius="md" p="md">
        <ModelList
          models={models}
          showActions
          displayedModelIds={['gpt-4.1']}
          onEditModel={() => undefined}
          onDeleteModel={() => undefined}
          onAddModel={() => undefined}
          onRemoveModel={() => undefined}
        />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Group mb="md">
          <Text size="sm">Key badges:</Text>
          <Keys keys={['mod', 'shift', 'k']} />
        </Group>
        <ShortcutConfig shortcuts={shortcuts} setShortcuts={setShortcuts} />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed">
          SortableItem.tsx is currently an empty source file in the repo, so the real preview state is an explicit empty
          component placeholder.
        </Text>
      </Paper>
    </Stack>
  )
}

function DevToolsFixture() {
  return (
    <Stack gap="lg">
      <DevHeader title="UI Inventory Preview" />
      <Paper withBorder radius="md" p="md">
        <Group>
          <ThemeSwitchButton />
          <Text size="sm">Theme switch button</Text>
        </Group>
      </Paper>
      <SessionAttachmentRagDevPane opened onClose={() => undefined} />
      <Paper withBorder radius="md" p="md">
        <ErrorTestPanel />
      </Paper>
    </Stack>
  )
}

function CommandAndDialogFixture() {
  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="Command and dialog primitives"
        description="Actual command palette and Radix dialog primitives used by app overlays."
      />
      <Command className="border border-solid border-chatbox-border-primary rounded-lg max-w-md">
        <CommandInput placeholder="Search commands..." />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem>
              Open Settings
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
            <CommandItem>
              New Chat
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Tools">
            <CommandItem>Toggle MCP</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <CommandDialog open>
        <CommandInput placeholder="Command dialog..." />
        <CommandList>
          <CommandGroup heading="Recent">
            <CommandItem>Search sessions</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>
              Actual Radix dialog content with header, description, footer, and close button.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}

function SeedAppBase() {
  queryClient.setQueryData(['blob', 'story-image-key'], storyImage)
  recentDirectoriesStore.setState({
    directories: ['/Users/themez/Desktop', '/Users/themez/Downloads', '/Users/themez/workspace/chatboxai'],
  })
  settingsStore.setState((state) => ({
    ...state,
    language: 'en',
    languageInited: true,
    theme: Theme.Light,
    licenseKey: '',
    licenseInstances: {},
    providers: [
      {
        id: ModelProviderEnum.OpenAI,
        name: 'OpenAI',
        type: 'openai',
        models,
      },
    ],
    customProviders: [
      {
        id: 'custom-story-provider',
        name: 'Internal Gateway',
        type: 'openai',
        isCustom: true,
        models,
      },
    ],
    mcp: {
      ...state.mcp,
      enabledBuiltinServers: [],
      servers: [
        {
          id: 'story-docs-mcp',
          name: 'Docs Search',
          enabled: true,
          transport: { type: 'http', url: 'https://mcp.example.com/sse' },
        },
      ],
    },
  }))

  const mutablePlatform = platform as typeof platform & {
    type: string
    openDirectoryDialog?: () => Promise<{ canceled: boolean; path?: string }>
    getSessionAttachmentRagController?: () => {
      getDebugSnapshot: () => Promise<{
        dbPath: string
        dbSizeBytes: number
        vectorDbPath: string
        vectorDbSizeBytes: number
        attachmentCount: number
        parentCount: number
        chunkCount: number
        vectorIndexNames: string[]
        statusCounts: { pending: number; indexing: number; ready: number; failed: number }
        recentAttachments: Array<{
          id: string
          filename: string
          status: 'pending' | 'indexing' | 'ready' | 'failed'
          chunkCount?: number
          parserType?: string
          error?: string
          createdAt?: number
          processingStartedAt?: number
          completedAt?: number
        }>
      }>
      clearAll: () => Promise<void>
    }
  }
  mutablePlatform.type = 'desktop'
  mutablePlatform.openDirectoryDialog = async () => ({ canceled: false, path: '/Users/themez/Projects' })
  mutablePlatform.getSessionAttachmentRagController = () => ({
    getDebugSnapshot: async () => ({
      dbPath: '/Users/themez/Library/Application Support/xyz.chatboxapp.app/session-rag.db',
      dbSizeBytes: 245760,
      vectorDbPath: '/Users/themez/Library/Application Support/xyz.chatboxapp.app/session-rag-vector.db',
      vectorDbSizeBytes: 98304,
      attachmentCount: 4,
      parentCount: 2,
      chunkCount: 128,
      vectorIndexNames: ['session_attachment_chunks_idx'],
      statusCounts: { pending: 1, indexing: 1, ready: 2, failed: 1 },
      recentAttachments: [
        {
          id: 'att-ready',
          filename: 'research.pdf',
          status: 'ready',
          chunkCount: 48,
          parserType: 'chatbox-ai',
          createdAt: Date.now() - 3600000,
          processingStartedAt: Date.now() - 3500000,
          completedAt: Date.now() - 3400000,
        },
        {
          id: 'att-failed',
          filename: 'scan.docx',
          status: 'failed',
          chunkCount: 0,
          parserType: 'local',
          error: 'Unsupported embedded object',
          createdAt: Date.now() - 7200000,
        },
      ],
    }),
    clearAll: async () => undefined,
  })

  return null
}

const storyRootRoute = createRootRoute({
  component: () => <StoryRouteSlot />,
})
const storyRoute = createRoute({
  getParentRoute: () => storyRootRoute,
  path: '/',
  component: () => <StoryRouteSlot />,
})
const storyRouter = createRouter({
  routeTree: storyRootRoute.addChildren([storyRoute]),
  history: createMemoryHistory({ initialEntries: ['/dev/ui-inventory'] }),
})
const StoryRouteContext = createContext<ReactNode>(null)

function StoryRouter({ children }: { children: ReactNode }) {
  return (
    <StoryRouteContext.Provider value={children}>
      <RouterProvider router={storyRouter} />
    </StoryRouteContext.Provider>
  )
}

function StoryRouteSlot() {
  return <>{useContext(StoryRouteContext)}</>
}

function SettingsSurface({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Stack gap="lg" maw={1040}>
      <SurfaceLabel title={title} description={description} />
      <Paper withBorder radius="md" p="md">
        {children}
      </Paper>
    </Stack>
  )
}

function SurfaceLabel({ title, description }: { title: string; description: string }) {
  return (
    <Stack gap={2}>
      <Text fw={700}>{title}</Text>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Stack>
  )
}
