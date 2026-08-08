import { Box, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import type { ImageGeneration } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { EmptyState } from '@/routes/image-creator/-components/EmptyState'
import { GeneratedImagesGallery } from '@/routes/image-creator/-components/GeneratedImagesGallery'
import { HistoryItem } from '@/routes/image-creator/-components/HistoryItem'
import { HistoryPanel } from '@/routes/image-creator/-components/HistoryPanel'
import { ImageGenerationErrorTips } from '@/routes/image-creator/-components/ImageGenerationErrorTips'
import {
  MobileHistoryDrawer,
  MobileModelDrawer,
  MobileRatioDrawer,
} from '@/routes/image-creator/-components/MobileDrawers'
import { PromptDisplay } from '@/routes/image-creator/-components/PromptDisplay'
import { ReferenceImagesPreview } from '@/routes/image-creator/-components/ReferenceImagesPreview'
import { LoadingShimmer } from '@/routes/image-creator/-components/Shimmer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

const meta: Meta = {
  title: 'Real Components/Image Creator',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Box p="lg" bg="var(--chatbox-background-primary)" style={{ maxWidth: 1040, minHeight: 560 }}>
          <Story />
        </Box>
      </QueryClientProvider>
    ),
  ],
}

export default meta

const sampleImages = [
  svgImageDataUrl({
    width: 640,
    height: 640,
    background: '#d0ebff',
    accent: '#228be6',
    label: 'Launch visual',
  }),
  svgImageDataUrl({
    width: 840,
    height: 520,
    background: '#fff3bf',
    accent: '#f08c00',
    label: 'Wide concept',
  }),
  svgImageDataUrl({
    width: 420,
    height: 680,
    background: '#d3f9d8',
    accent: '#2f9e44',
    label: 'Portrait poster',
  }),
]

const historyRecords: ImageGeneration[] = [
  {
    id: 'image-story-1',
    prompt: 'A polished product launch banner with a blue glass workspace and warm studio light.',
    referenceImages: [sampleImages[0]],
    generatedImages: [sampleImages[0], sampleImages[1]],
    createdAt: Date.now() - 1000 * 60 * 14,
    model: { provider: 'openai', modelId: 'gpt-image-1' },
    dalleStyle: 'vivid',
    imageGenerateNum: 2,
    status: 'done',
    aspectRatio: '1:1',
  },
  {
    id: 'image-story-2',
    prompt: 'A compact support handbook cover with chat bubbles and clean document cards.',
    referenceImages: [],
    generatedImages: [sampleImages[1]],
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    model: { provider: 'chatbox-ai', modelId: 'chatboxai-paint' },
    dalleStyle: 'natural',
    imageGenerateNum: 1,
    status: 'done',
    aspectRatio: '16:9',
  },
  {
    id: 'image-story-error',
    prompt: 'A blocked image request for moderation state.',
    referenceImages: [],
    generatedImages: [],
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    model: { provider: 'chatbox-ai', modelId: 'chatboxai-paint' },
    status: 'error',
    error: 'The image request could not be completed.',
    errorCode: 'image_content_moderation_blocked',
    errorItemUuid: 'img-item-story-0001',
    taskId: 'task-story-0001',
  },
]

export const EmptyStateStates: StoryObj = {
  name: 'Image creator empty quick prompt states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/EmptyState'],
  },
  render: () => <EmptyStateFixture />,
}

export const GeneratedImagesGalleryStates: StoryObj = {
  name: 'Generated images gallery desktop aspect hover action states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/GeneratedImagesGallery'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="GeneratedImagesGallery"
        description="Actual generated image gallery with dynamic dimensions, preview affordance, use-as-reference, download, and report action wiring."
      />
      <GeneratedImagesGallery images={sampleImages} onUseAsReference={() => undefined} onReport={() => undefined} />
    </Stack>
  ),
}

export const HistoryItemStates: StoryObj = {
  name: 'Image generation history item active desktop mobile and empty thumbnail states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/HistoryItem'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="HistoryItem"
        description="Actual history item cards with active border, prompt, model label, date on mobile, delete action, image thumbnail, and empty thumbnail state."
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <HistoryCard label="Active desktop">
          <HistoryItem
            record={historyRecords[0]}
            isActive
            modelDisplayName="GPT Image 1"
            onClick={() => undefined}
            onDelete={() => undefined}
          />
        </HistoryCard>
        <HistoryCard label="Mobile">
          <HistoryItem
            record={historyRecords[1]}
            isActive={false}
            isMobile
            modelDisplayName="Chatbox AI Paint"
            onClick={() => undefined}
            onDelete={() => undefined}
          />
        </HistoryCard>
        <HistoryCard label="No generated image">
          <HistoryItem
            record={historyRecords[2]}
            isActive={false}
            modelDisplayName="Chatbox AI Paint"
            onClick={() => undefined}
            onDelete={() => undefined}
          />
        </HistoryCard>
      </SimpleGrid>
    </Stack>
  ),
}

export const HistoryPanelStates: StoryObj = {
  name: 'Image creator history panel loading empty populated and collapsed states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/HistoryPanel'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="HistoryPanel"
        description="Actual desktop history panel with header actions, virtualized records, load-more footer, loading skeletons, empty state, and collapsed state."
      />
      <Group align="stretch" gap="md">
        <PanelFrame label="Populated">
          <HistoryPanel
            show
            width={170}
            historyCache={historyRecords}
            historyLoading={false}
            currentRecordId={historyRecords[0].id}
            getModelDisplayName={getModelDisplayName}
            hasNextPage
            isFetchingNextPage={false}
            onItemClick={() => undefined}
            onLoadMore={() => undefined}
            onNewCreation={() => undefined}
            onClose={() => undefined}
            onDelete={() => undefined}
          />
        </PanelFrame>
        <PanelFrame label="Loading">
          <HistoryPanel
            show
            width={170}
            historyCache={[]}
            historyLoading
            currentRecordId={null}
            getModelDisplayName={getModelDisplayName}
            hasNextPage={false}
            isFetchingNextPage={false}
            onItemClick={() => undefined}
            onLoadMore={() => undefined}
            onNewCreation={() => undefined}
            onClose={() => undefined}
            onDelete={() => undefined}
          />
        </PanelFrame>
        <PanelFrame label="Collapsed">
          <HistoryPanel
            show={false}
            width={170}
            historyCache={historyRecords}
            historyLoading={false}
            currentRecordId={null}
            getModelDisplayName={getModelDisplayName}
            hasNextPage={false}
            isFetchingNextPage={false}
            onItemClick={() => undefined}
            onLoadMore={() => undefined}
            onNewCreation={() => undefined}
            onClose={() => undefined}
            onDelete={() => undefined}
          />
        </PanelFrame>
      </Group>
    </Stack>
  ),
}

export const ImageGenerationErrorTipsStates: StoryObj = {
  name: 'Image generation error tips moderation provider and retrying states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/ImageGenerationErrorTips'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ImageGenerationErrorTips"
        description="Actual image generation error panel with moderation message, debug IDs, copy action, retry action, and retry loading state."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <ImageGenerationErrorTips record={historyRecords[2]} onRetry={() => undefined} isRetrying={false} />
        <ImageGenerationErrorTips
          record={{
            ...historyRecords[2],
            id: 'image-story-provider-error',
            errorCode: 'ai_provider_error',
            taskId: 'task-story-provider',
          }}
          onRetry={() => undefined}
          isRetrying
        />
      </SimpleGrid>
    </Stack>
  ),
}

export const MobileDrawerStates: StoryObj = {
  name: 'Image creator mobile history model and ratio drawer states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/MobileDrawers'],
  },
  render: () => <MobileDrawersFixture />,
}

export const PromptDisplayStates: StoryObj = {
  name: 'Image creator prompt display with model and reference count states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/PromptDisplay'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="PromptDisplay"
        description="Actual prompt summary shown above generated results with model display name and reference image count."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <PromptSurface>
          <PromptDisplay
            prompt="A refined product launch image with glass panels, product cards, and warm highlights."
            modelDisplayName="GPT Image 1"
            referenceImageCount={2}
          />
        </PromptSurface>
        <PromptSurface>
          <PromptDisplay
            prompt="A simple square social image with bold copy and calm workspace details."
            modelDisplayName="Chatbox AI Paint"
            referenceImageCount={0}
          />
        </PromptSurface>
      </SimpleGrid>
    </Stack>
  ),
}

export const ReferenceImagesPreviewStates: StoryObj = {
  name: 'Image creator reference images preview removable and add states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/ReferenceImagesPreview'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ReferenceImagesPreview"
        description="Actual reference image strip with thumbnails, remove affordance, and add placeholder while under the max image count."
      />
      <Paper withBorder radius="md" p="md">
        <ReferenceImagesPreview
          images={sampleImages.slice(0, 3).map((storageKey) => ({ storageKey }))}
          onRemove={() => undefined}
          onAddClick={() => undefined}
        />
      </Paper>
    </Stack>
  ),
}

export const LoadingShimmerStates: StoryObj = {
  name: 'Image creator shimmer loading animation state',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/image-creator/-components/Shimmer'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="LoadingShimmer"
        description="Actual image generation loading shimmer used while a generation task is waiting for results."
      />
      <LoadingShimmer />
    </Stack>
  ),
}

function EmptyStateFixture() {
  const [selectedPrompt, setSelectedPrompt] = useState('')
  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="EmptyState"
        description="Actual image creator empty state with prompt examples and prompt selection callback."
      />
      <EmptyState onPromptSelect={setSelectedPrompt} />
      <Text size="sm" c="dimmed">
        Selected prompt: {selectedPrompt || 'None'}
      </Text>
    </Stack>
  )
}

function MobileDrawersFixture() {
  const [selectedModel, setSelectedModel] = useState({ provider: 'openai', model: 'gpt-image-1' })
  const [selectedRatio, setSelectedRatio] = useState('1:1')

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="MobileDrawers"
        description="Actual mobile bottom drawers for history, model selection, and aspect ratio selection. They are mounted open to expose their production layout."
      />
      <Text size="sm" c="dimmed">
        Selected model: {selectedModel.provider}/{selectedModel.model}; ratio: {selectedRatio}
      </Text>
      <MobileHistoryDrawer
        open
        onOpenChange={() => undefined}
        historyCache={historyRecords}
        historyLoading={false}
        currentRecordId={historyRecords[0].id}
        getModelDisplayName={getModelDisplayName}
        hasNextPage={false}
        isFetchingNextPage={false}
        onItemClick={() => undefined}
        onLoadMore={() => undefined}
        onNewCreation={() => undefined}
        onDelete={() => undefined}
      />
      <MobileModelDrawer
        open
        onOpenChange={() => undefined}
        modelGroups={[
          {
            label: 'OpenAI',
            providerId: 'openai',
            models: [
              { modelId: 'gpt-image-1', displayName: 'GPT Image 1' },
              { modelId: 'gpt-image-1.5', displayName: 'GPT Image 1.5' },
            ],
          },
          {
            label: 'Custom Gateway',
            providerId: 'custom-provider',
            isCustom: true,
            models: [{ modelId: 'local-poster', displayName: 'Local Poster Model' }],
          },
        ]}
        selectedProvider={selectedModel.provider}
        selectedModel={selectedModel.model}
        onSelect={(provider, model) => setSelectedModel({ provider, model })}
      />
      <MobileRatioDrawer
        open
        onOpenChange={() => undefined}
        options={['1:1', '16:9', '9:16', '4:3']}
        selectedRatio={selectedRatio}
        onSelect={setSelectedRatio}
      />
    </Stack>
  )
}

function getModelDisplayName(record: ImageGeneration) {
  if (record.model.modelId === 'gpt-image-1') return 'GPT Image 1'
  if (record.model.modelId === 'chatboxai-paint') return 'Chatbox AI Paint'
  return record.model.modelId
}

function HistoryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md" style={{ maxWidth: 190 }}>
      <Text size="xs" c="dimmed" mb="xs">
        {label}
      </Text>
      {children}
    </Paper>
  )
}

function PanelFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="xs" style={{ width: 190, height: 430, overflow: 'hidden' }}>
      <Text size="xs" c="dimmed" mb="xs">
        {label}
      </Text>
      <Box h={390}>{children}</Box>
    </Paper>
  )
}

function PromptSurface({ children }: { children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg">
      {children}
    </Paper>
  )
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

function svgImageDataUrl(input: { width: number; height: number; background: string; accent: string; label: string }) {
  const circleX = Math.round(input.width * 0.72)
  const circleY = Math.round(input.height * 0.28)
  const circleRadius = Math.round(Math.min(input.width, input.height) * 0.16)
  const panelX = Math.round(input.width * 0.12)
  const panelY = Math.round(input.height * 0.54)
  const panelWidth = Math.round(input.width * 0.76)
  const panelHeight = Math.round(input.height * 0.18)
  const textX = Math.round(input.width / 2)
  const textY = Math.round(input.height * 0.65)
  const fontSize = Math.round(Math.min(input.width, input.height) * 0.07)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `<rect width="${input.width}" height="${input.height}" rx="32" fill="${input.background}"/>`,
    `<circle cx="${circleX}" cy="${circleY}" r="${circleRadius}" fill="${input.accent}" opacity="0.28"/>`,
    `<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="18" fill="white" opacity="0.88"/>`,
    `<text x="${textX}" y="${textY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="` +
      fontSize +
      `" font-weight="700" fill="${input.accent}">${input.label}</text>`,
    '</svg>',
  ].join('')
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
