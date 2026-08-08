import NiceModal from '@ebay/nice-modal-react'
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { type KnowledgeBase, type KnowledgeBaseFile, ModelProviderEnum } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import platform from '@/platform'
import type { KnowledgeBaseController } from '@/platform/knowledge-base/interface'
import { settingsStore } from '@/stores/settingsStore'
import ChunksPreviewModal from '../knowledge-base/ChunksPreviewModal'
import KnowledgeBasePage from '../knowledge-base/KnowledgeBase'
import KnowledgeBaseDocuments from '../knowledge-base/KnowledgeBaseDocuments'
import {
  DocumentParserDisplay,
  DocumentParserSelector,
  KnowledgeBaseChatboxAIInfo,
  KnowledgeBaseFormActions,
  KnowledgeBaseModelSelectors,
  KnowledgeBaseNameInput,
  KnowledgeBaseProviderModeSelect,
} from '../knowledge-base/KnowledgeBaseForm'
import KnowledgeBaseMenu from '../knowledge-base/KnowledgeBaseMenu'
import { RemoteRetryModal } from '../knowledge-base/RemoteRetryModal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

const meta: Meta = {
  title: 'Real Components/Knowledge Base',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <NiceModal.Provider>
          <StoryRouter>
            <SeedKnowledgeBaseEnvironment />
            <Box p="lg" bg="var(--chatbox-background-primary)" style={{ maxWidth: 980, minHeight: 560 }}>
              <Story />
            </Box>
          </StoryRouter>
        </NiceModal.Provider>
      </QueryClientProvider>
    ),
  ],
}

export default meta

const knowledgeBases: KnowledgeBase[] = [
  {
    id: 101,
    name: 'Product launch knowledge base',
    embeddingModel: `${ModelProviderEnum.OpenAI}:text-embedding-3-large`,
    rerankModel: 'cohere:rerank-v3.5',
    visionModel: `${ModelProviderEnum.OpenAI}:gpt-4.1`,
    providerMode: 'custom',
    documentParser: { type: 'local' },
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 102,
    name: 'Chatbox AI support handbook',
    embeddingModel: 'chatbox-ai:embedding',
    rerankModel: 'chatbox-ai:rerank',
    visionModel: 'chatbox-ai:vision',
    providerMode: 'chatbox-ai',
    documentParser: { type: 'chatbox-ai' },
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
]

const knowledgeBaseFiles: KnowledgeBaseFile[] = [
  {
    id: 1,
    kb_id: 101,
    filename: 'pricing-strategy.pdf',
    filepath: '/tmp/pricing-strategy.pdf',
    mime_type: 'application/pdf',
    file_size: 1_240_000,
    chunk_count: 36,
    total_chunks: 36,
    status: 'done',
    error: '',
    createdAt: Date.now() - 1000 * 60 * 90,
    parsed_remotely: 0,
    parser_type: 'local',
  },
  {
    id: 2,
    kb_id: 101,
    filename: 'release-checklist.docx',
    filepath: '/tmp/release-checklist.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size: 340_000,
    chunk_count: 14,
    total_chunks: 40,
    status: 'processing',
    error: '',
    createdAt: Date.now() - 1000 * 60 * 40,
    parsed_remotely: 0,
    parser_type: 'local',
  },
  {
    id: 3,
    kb_id: 101,
    filename: 'customer-interviews.xlsx',
    filepath: '/tmp/customer-interviews.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size: 780_000,
    chunk_count: 18,
    total_chunks: 42,
    status: 'paused',
    error: '',
    createdAt: Date.now() - 1000 * 60 * 20,
    parsed_remotely: 0,
    parser_type: 'local',
  },
  {
    id: 4,
    kb_id: 101,
    filename: 'scanned-contract.png',
    filepath: '/tmp/scanned-contract.png',
    mime_type: 'image/png',
    file_size: 2_800_000,
    chunk_count: 0,
    total_chunks: 0,
    status: 'failed',
    error: 'Local parser could not extract text from this image-only document.',
    createdAt: Date.now() - 1000 * 60 * 10,
    parsed_remotely: 0,
    parser_type: 'local',
  },
  {
    id: 5,
    kb_id: 101,
    filename: 'large-archive.txt',
    filepath: '/tmp/large-archive.txt',
    mime_type: 'text/plain',
    file_size: 9_600_000,
    chunk_count: 0,
    total_chunks: 0,
    status: 'failed',
    error: 'Parsed document content is too large',
    createdAt: Date.now() - 1000 * 60 * 8,
    parsed_remotely: 1,
    parser_type: 'chatbox-ai',
  },
]

const mockController: KnowledgeBaseController = {
  list: async () => knowledgeBases,
  create: async () => undefined,
  delete: async () => undefined,
  listFiles: async (kbId) => knowledgeBaseFiles.filter((file) => file.kb_id === kbId),
  countFiles: async (kbId) => knowledgeBaseFiles.filter((file) => file.kb_id === kbId).length,
  listFilesPaginated: async (kbId, offset = 0, limit = 20) =>
    knowledgeBaseFiles.filter((file) => file.kb_id === kbId).slice(offset, offset + limit),
  uploadFile: async () => undefined,
  deleteFile: async () => undefined,
  retryFile: async () => undefined,
  pauseFile: async () => undefined,
  resumeFile: async () => undefined,
  search: async () => [],
  update: async () => undefined,
  getFilesMeta: async (kbId, fileIds) =>
    knowledgeBaseFiles
      .filter((file) => file.kb_id === kbId && fileIds.includes(file.id))
      .map((file) => ({
        id: file.id,
        kbId,
        filename: file.filename,
        mimeType: file.mime_type,
        fileSize: file.file_size,
        chunkCount: file.chunk_count,
        totalChunks: file.total_chunks,
        status: file.status,
        createdAt: file.createdAt,
      })),
  readFileChunks: async (_kbId, chunks) =>
    chunks.map((chunk) => ({
      ...chunk,
      filename: knowledgeBaseFiles.find((file) => file.id === chunk.fileId)?.filename || 'document.txt',
      text: [
        'Launch readiness notes:',
        'The pricing page should lead with local-first privacy and desktop knowledge base support.',
        'Support teams need reliable citations from uploaded documents before rollout.',
      ].join('\n'),
    })),
  testMineruConnection: async (apiToken) =>
    apiToken.trim() ? { success: true } : { success: false, error: 'Missing token' },
}

export const KnowledgeBasePageStates: StoryObj = {
  name: 'Knowledge base page list documents and provider states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/knowledge-base/KnowledgeBase'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="KnowledgeBase"
        description="Actual knowledge base settings page with configured bases, provider pills, parser pills, edit actions, and embedded document lists."
      />
      <Paper withBorder radius="md" maw={920}>
        <KnowledgeBasePage />
      </Paper>
    </Stack>
  ),
}

export const KnowledgeBaseDocumentsStates: StoryObj = {
  name: 'Knowledge base documents upload ready processing paused failed states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/knowledge-base/KnowledgeBaseDocuments'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="KnowledgeBaseDocuments"
        description="Actual documents section with upload affordance, completed file, processing progress, paused file, local parse failure, server parse failure, retry, pause, resume, delete, and chunks preview entry points."
      />
      <Paper withBorder radius="md" p="md">
        <KnowledgeBaseDocuments knowledgeBase={knowledgeBases[0]} />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Text size="xs" c="dimmed" mb="xs">
          Empty knowledge base
        </Text>
        <KnowledgeBaseDocuments knowledgeBase={{ ...knowledgeBases[0], id: 999, name: 'Empty onboarding docs' }} />
      </Paper>
    </Stack>
  ),
}

export const KnowledgeBaseFormStates: StoryObj = {
  name: 'Knowledge base form provider parser model and action states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/knowledge-base/KnowledgeBaseForm'],
  },
  render: () => <KnowledgeBaseFormFixture />,
}

export const KnowledgeBaseMenuStates: StoryObj = {
  name: 'Knowledge base menu selected and create states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/knowledge-base/KnowledgeBaseMenu'],
  },
  render: () => <KnowledgeBaseMenuFixture />,
}

export const KnowledgeBaseModalStates: StoryObj = {
  name: 'Knowledge base chunks preview and remote retry modal states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/knowledge-base/ChunksPreviewModal',
      'src/renderer/components/knowledge-base/RemoteRetryModal',
    ],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ChunksPreviewModal and RemoteRetryModal"
        description="Actual knowledge base modals for inspecting parsed chunks and retrying local parser failures with server parsing."
      />
      <Paper withBorder radius="md" p="md" h={320}>
        <Text size="sm" c="dimmed">
          The production modals are mounted open in this preview.
        </Text>
        <ChunksPreviewModal
          opened
          onClose={() => undefined}
          file={knowledgeBaseFiles[0]}
          knowledgeBaseId={knowledgeBases[0].id}
        />
        <RemoteRetryModal
          opened
          onClose={() => undefined}
          failedFiles={knowledgeBaseFiles.filter((file) => file.status === 'failed')}
          onSuccess={() => undefined}
        />
      </Paper>
    </Stack>
  ),
}

function KnowledgeBaseFormFixture() {
  const [providerMode, setProviderMode] = useState<'chatbox-ai' | 'custom'>('custom')
  const [name, setName] = useState('Product launch knowledge base')
  const [parserConfig, setParserConfig] = useState({ type: 'mineru' as const, mineru: { apiToken: 'mineru-token' } })
  const [embeddingModel, setEmbeddingModel] = useState(`${ModelProviderEnum.OpenAI}:text-embedding-3-large`)
  const [rerankModel, setRerankModel] = useState('cohere:rerank-v3.5')
  const [visionModel, setVisionModel] = useState(`${ModelProviderEnum.OpenAI}:gpt-4.1`)

  const embeddingModels = [
    { label: 'OpenAI | Text Embedding 3 Large', value: `${ModelProviderEnum.OpenAI}:text-embedding-3-large` },
  ]
  const rerankModels = [{ label: 'Cohere | Rerank v3.5', value: 'cohere:rerank-v3.5' }]
  const visionModels = [{ label: 'OpenAI | GPT-4.1', value: `${ModelProviderEnum.OpenAI}:gpt-4.1` }]

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="KnowledgeBaseForm"
        description="Actual form controls used for create/edit knowledge base flows, including provider mode, parser selection, model selectors, read-only parser display, Chatbox AI info, and destructive edit actions."
      />
      <Paper withBorder radius="md" p="md" maw={640}>
        <Stack gap="md">
          <KnowledgeBaseNameInput value={name} onChange={setName} label="Name" />
          <KnowledgeBaseProviderModeSelect value={providerMode} onChange={setProviderMode} />
          <KnowledgeBaseChatboxAIInfo showModelsLabel />
          <DocumentParserSelector parserConfig={parserConfig} onParserConfigChange={setParserConfig} />
          <KnowledgeBaseModelSelectors
            embeddingModelList={embeddingModels}
            rerankModelList={rerankModels}
            visionModelList={visionModels}
            embeddingModel={embeddingModel}
            rerankModel={rerankModel}
            visionModel={visionModel}
            onEmbeddingModelChange={(value) => value && setEmbeddingModel(value)}
            onRerankModelChange={setRerankModel}
            onVisionModelChange={setVisionModel}
          />
          <DocumentParserDisplay parserType="chatbox-ai" />
          <KnowledgeBaseFormActions
            onCancel={() => undefined}
            onConfirm={() => undefined}
            confirmText="Save"
            showDelete
            onDelete={() => undefined}
          />
        </Stack>
      </Paper>
    </Stack>
  )
}

function KnowledgeBaseMenuFixture() {
  const targetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const button = targetRef.current?.querySelector('button')
    button?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="KnowledgeBaseMenu"
        description="Actual composer knowledge base selector menu with selected state and settings/create entry points."
      />
      <Group align="flex-start">
        <Paper withBorder radius="md" p="md" ref={targetRef}>
          <KnowledgeBaseMenu currentKnowledgeBaseId={101} opened onSelect={() => undefined}>
            <Button>Knowledge Base: Product launch</Button>
          </KnowledgeBaseMenu>
        </Paper>
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb={8}>
            Empty state uses the same menu after the query returns no knowledge bases.
          </Text>
          <QueryClientProvider client={emptyQueryClient}>
            <KnowledgeBaseMenu opened onSelect={() => undefined}>
              <Button variant="light">Knowledge Base</Button>
            </KnowledgeBaseMenu>
          </QueryClientProvider>
        </Paper>
      </Group>
    </Stack>
  )
}

const emptyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
})
emptyQueryClient.setQueryData(['knowledge-bases'], [])

let isKnowledgeBaseEnvironmentSeeded = false
const originalKnowledgeBasePlatform = {
  getKnowledgeBaseController: platform.getKnowledgeBaseController,
  getPlatform: platform.getPlatform,
  getArch: platform.getArch,
}

function SeedKnowledgeBaseEnvironment() {
  if (!isKnowledgeBaseEnvironmentSeeded) {
    isKnowledgeBaseEnvironmentSeeded = true
    platform.getKnowledgeBaseController = () => mockController
    platform.getPlatform = async () => 'darwin'
    platform.getArch = async () => 'arm64'

    settingsStore.setState((state) => ({
      ...state,
      licenseKey: 'storybook-license',
      providers: {
        ...state.providers,
        [ModelProviderEnum.OpenAI]: {
          apiKey: 'storybook-openai',
          models: [
            { modelId: 'gpt-4.1', nickname: 'GPT-4.1', capabilities: ['vision', 'tool_use'] },
            { modelId: 'text-embedding-3-large', nickname: 'Text Embedding 3 Large', type: 'embedding' },
          ],
        },
        cohere: {
          apiKey: 'storybook-cohere',
          models: [{ modelId: 'rerank-v3.5', nickname: 'Rerank v3.5', type: 'rerank' }],
        },
      },
      extension: {
        ...state.extension,
        documentParser: {
          ...state.extension.documentParser,
          type: 'local',
        },
      },
    }))

    queryClient.setQueryData(['knowledge-bases'], knowledgeBases)
    queryClient.setQueryData(['knowledge-base-files', 101, 20], {
      pages: [{ files: knowledgeBaseFiles, nextCursor: null }],
      pageParams: [0],
    })
    queryClient.setQueryData(['knowledge-base-files-count', 101], knowledgeBaseFiles.length)
    queryClient.setQueryData(['knowledge-base-files', 999, 20], {
      pages: [{ files: [], nextCursor: null }],
      pageParams: [0],
    })
    queryClient.setQueryData(['knowledge-base-files-count', 999], 0)
  }

  useEffect(() => {
    return () => {
      platform.getKnowledgeBaseController = originalKnowledgeBasePlatform.getKnowledgeBaseController
      platform.getPlatform = originalKnowledgeBasePlatform.getPlatform
      platform.getArch = originalKnowledgeBasePlatform.getArch
      isKnowledgeBaseEnvironmentSeeded = false
    }
  }, [])

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
  history: createMemoryHistory({ initialEntries: ['/'] }),
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
