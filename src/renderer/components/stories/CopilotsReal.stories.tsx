import NiceModal from '@ebay/nice-modal-react'
import { Box, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import type { CopilotDetail } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import CopilotDetailModal from '@/routes/copilots/-components/CopilotDetailModal'
import CopilotItem from '@/routes/copilots/-components/CopilotItem'
import CopilotSettingsModal from '@/routes/copilots/-components/CopilotSettingsModal'
import ExpandableSearch from '@/routes/copilots/-components/ExpandableSearch'

NiceModal.register('copilot-settings', CopilotSettingsModal)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

const meta: Meta = {
  title: 'Real Components/Copilots',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <NiceModal.Provider>
          <StoryRouter>
            <Box p="lg" bg="var(--chatbox-background-primary)" style={{ maxWidth: 960, minHeight: 560 }}>
              <Story />
            </Box>
          </StoryRouter>
        </NiceModal.Provider>
      </QueryClientProvider>
    ),
  ],
}

export default meta

const remoteCopilot: CopilotDetail = {
  id: 'remote-product-manager',
  name: 'Launch Product Manager',
  description: 'Turns release notes, QA signals, and roadmap context into crisp launch decisions.',
  prompt: [
    'You are a pragmatic product manager.',
    'Read the user context, identify launch blockers, and produce a decision-ready checklist.',
    'Keep tradeoffs explicit and cite source material when available.',
  ].join('\n'),
  tags: ['Productivity', 'Writing', 'Research'],
  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
  usedCount: 1280,
  avatar: {
    type: 'url',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="%23228be6"/><text x="48" y="58" font-size="34" text-anchor="middle" fill="white" font-family="Arial">L</text></svg>',
  },
  screenshots: [
    {
      type: 'url',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" rx="18" fill="%23f1f3f5"/><rect x="32" y="40" width="416" height="46" rx="8" fill="%23d0ebff"/><rect x="32" y="112" width="290" height="26" rx="6" fill="%23adb5bd"/><rect x="32" y="154" width="360" height="26" rx="6" fill="%23ced4da"/><rect x="32" y="216" width="416" height="58" rx="10" fill="%23ffffff"/></svg>',
    },
  ],
}

const localCopilot: CopilotDetail = {
  ...remoteCopilot,
  id: 'local-support-writer',
  name: 'Support Reply Writer',
  description: 'Drafts concise support replies with product-specific next steps.',
  tags: ['Support', 'Customer'],
  starred: true,
  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
}

export const CopilotItemStates: StoryObj = {
  name: 'Copilot item local starred remote and highlighted states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/copilots/-components/CopilotItem'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="CopilotItem"
        description="Actual copilot card with avatar, highlighted search text, tags, created/published dates, local edit menu, starred state, and remote card state."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <CopilotItem copilot={localCopilot} type="local" highlightTerm="Support" />
        <CopilotItem copilot={remoteCopilot} type="remote" highlightTerm="Launch" />
      </SimpleGrid>
    </Stack>
  ),
}

export const CopilotDetailModalStates: StoryObj = {
  name: 'Copilot detail local remote screenshots and action states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/copilots/-components/CopilotDetailModal'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="CopilotDetailModal"
        description="Actual copilot detail modal with avatar, tags, description, prompt content, screenshot gallery, local edit action, remote add action, and use action."
      />
      <Paper withBorder radius="md" p="md" h={420}>
        <Text size="sm" c="dimmed">
          Both production detail modal variants are mounted open.
        </Text>
        <CopilotDetailModal
          opened
          onClose={() => undefined}
          type="local"
          copilot={localCopilot}
          onUse={() => undefined}
        />
        <CopilotDetailModal
          opened
          onClose={() => undefined}
          type="remote"
          copilot={remoteCopilot}
          onUse={() => undefined}
        />
      </Paper>
    </Stack>
  ),
}

export const CopilotSettingsModalStates: StoryObj = {
  name: 'Copilot settings create edit form states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/copilots/-components/CopilotSettingsModal'],
  },
  render: () => <CopilotSettingsFixture />,
}

export const ExpandableSearchStates: StoryObj = {
  name: 'Expandable search collapsed expanded and typed states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/copilots/-components/ExpandableSearch'],
  },
  render: () => <ExpandableSearchFixture />,
}

function CopilotSettingsFixture() {
  useEffect(() => {
    void NiceModal.show('copilot-settings', {
      copilot: localCopilot,
      mode: 'edit',
      onSave: () => undefined,
      onDelete: () => undefined,
    })
    void NiceModal.show('copilot-settings', {
      mode: 'create',
      onSave: () => undefined,
    })
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="CopilotSettingsModal"
        description="Actual create and edit copilot settings modal with title, avatar upload, background upload, description, prompt, validation-ready fields, cancel, and save actions."
      />
      <Paper withBorder radius="md" p="md" h={360}>
        <Text size="sm" c="dimmed">
          The production NiceModal entries are opened by the same modal registration used in the app.
        </Text>
      </Paper>
    </Stack>
  )
}

function ExpandableSearchFixture() {
  const [term, setTerm] = useState('')
  const expandedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const button = expandedRef.current?.querySelector('button')
    button?.click()
    setTimeout(() => {
      const input = expandedRef.current?.querySelector('input')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'launch')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    }, 350)
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="ExpandableSearch"
        description="Actual collapsible copilot search control with collapsed icon, expanded input, clear button, and submit action."
      />
      <Group align="center">
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb={8}>
            Collapsed
          </Text>
          <ExpandableSearch onSearch={setTerm} />
        </Paper>
        <Paper withBorder radius="md" p="md" ref={expandedRef}>
          <Text size="xs" c="dimmed" mb={8}>
            Expanded with typed query
          </Text>
          <ExpandableSearch onSearch={setTerm} />
        </Paper>
      </Group>
      <Text size="sm" c="dimmed">
        Last submitted search: {term || 'None'}
      </Text>
    </Stack>
  )
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
