import NiceModal from '@ebay/nice-modal-react'
import { Box, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import type { UserLicense } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import {
  FreeTrialLink,
  LoginButton,
  NewChatButton,
  NewChatTip,
  ProviderSettingsButton,
  ViewLicenseButton,
} from '@/routes/guide/-components/ActionButton'
import { ClaimWaitingCard } from '@/routes/guide/-components/ClaimWaitingCard'
import { GuideMessage } from '@/routes/guide/-components/GuideMessage'
import { SuggestedQuestions } from '@/routes/guide/-components/SuggestedQuestions'
import { UserTypeCards } from '@/routes/guide/-components/UserTypeCards'
import type { GuideToolName, GuideToolPart, GuideUIMessage, UserType } from '@/routes/guide/-hooks/useGuideSession'
import { settingsStore } from '@/stores/settingsStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

const meta: Meta = {
  title: 'Real Components/Guide',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <NiceModal.Provider>
          <StoryRouter>
            <GuideStoryEnvironment />
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

const sampleLicense: UserLicense = {
  key: 'trial-guide-story-license',
  product_name: 'Chatbox AI Pro',
  product_id: 'chatbox-ai-pro',
  active: true,
  created_at: new Date().toISOString(),
  expired_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  seats: 1,
}

export const GuideActionButtonsStates: StoryObj = {
  name: 'Guide action login settings license free trial and new chat states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/guide/-components/ActionButton'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ActionButton"
        description="Actual guide action components for login, provider settings, new chat, onboarding tip, license details, and free trial claim."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <ActionSurface label="Login">
          <LoginButton onLoginSuccess={() => undefined} />
        </ActionSurface>
        <ActionSurface label="Provider settings">
          <ProviderSettingsButton />
        </ActionSurface>
        <ActionSurface label="New chat">
          <NewChatButton label="Start a new chat" />
        </ActionSurface>
        <ActionSurface label="License">
          <ViewLicenseButton />
        </ActionSurface>
        <ActionSurface label="Free trial">
          <FreeTrialLink onAfterClick={() => undefined} />
        </ActionSurface>
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb="xs">
            New chat tip
          </Text>
          <NewChatTip />
        </Paper>
      </SimpleGrid>
    </Stack>
  ),
}

export const UserTypeCardsStates: StoryObj = {
  name: 'Guide user type cards active disabled and selected states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/guide/-components/UserTypeCards'],
  },
  render: () => <UserTypeCardsFixture />,
}

export const SuggestedQuestionsStates: StoryObj = {
  name: 'Guide suggested questions active and disabled states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/guide/-components/SuggestedQuestions'],
  },
  render: () => <SuggestedQuestionsFixture />,
}

export const ClaimWaitingCardStates: StoryObj = {
  name: 'Guide claim waiting card polling and escape actions',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/guide/-components/ClaimWaitingCard'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ClaimWaitingCard"
        description="Actual waiting card shown after the free-plan claim page opens, including progress indicator, reopen, and skip actions."
      />
      <Paper withBorder radius="md" p="md">
        <ClaimWaitingCard onClaimDetected={() => undefined} />
      </Paper>
    </Stack>
  ),
}

export const GuideMessageStates: StoryObj = {
  name: 'Guide message user assistant streaming and tool part states',
  parameters: {
    uiInventoryTargets: ['src/renderer/routes/guide/-components/GuideMessage'],
  },
  render: () => <GuideMessageFixture />,
}

function UserTypeCardsFixture() {
  const [selected, setSelected] = useState<UserType | null>(null)

  useEffect(() => {
    setTimeout(() => {
      const firstCard = document.querySelector('[data-story-user-type-selected] button')
      if (firstCard instanceof HTMLButtonElement) {
        firstCard.click()
      }
    }, 300)
  }, [])

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="UserTypeCards"
        description="Actual onboarding user-type card group with recommended state, hover-ready actions, disabled state, and selected state."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb="xs">
            Active
          </Text>
          <UserTypeCards onSelect={setSelected} />
          <Text size="sm" c="dimmed">
            Selected: {selected ?? 'None'}
          </Text>
        </Paper>
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb="xs">
            Disabled
          </Text>
          <UserTypeCards onSelect={() => undefined} disabled />
        </Paper>
        <Paper withBorder radius="md" p="md" data-story-user-type-selected>
          <Text size="xs" c="dimmed" mb="xs">
            Selected
          </Text>
          <UserTypeCards onSelect={() => undefined} />
        </Paper>
      </SimpleGrid>
    </Stack>
  )
}

function SuggestedQuestionsFixture() {
  const [lastQuestion, setLastQuestion] = useState('')

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="SuggestedQuestions"
        description="Actual suggested guide questions with active chip buttons and disabled previous-message state."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb="xs">
            Active
          </Text>
          <SuggestedQuestions onQuestionClick={setLastQuestion} />
        </Paper>
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" mb="xs">
            Disabled
          </Text>
          <SuggestedQuestions onQuestionClick={() => undefined} disabled />
        </Paper>
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        Last clicked question: {lastQuestion || 'None'}
      </Text>
    </Stack>
  )
}

function GuideMessageFixture() {
  const [selectedType, setSelectedType] = useState<UserType | null>(null)
  const [lastQuestion, setLastQuestion] = useState('')
  const [claimStarted, setClaimStarted] = useState(false)

  return (
    <Stack gap="lg">
      <SurfaceLabel
        title="GuideMessage"
        description="Actual guide chat message renderer with user bubble, assistant markdown, streaming loader, and rendered tool parts."
      />
      <Paper withBorder radius="md" p="md">
        <Stack gap={0}>
          <GuideMessage message={userMessage} />
          <GuideMessage
            message={assistantGreetingMessage}
            isLastMessage={false}
            onSelectUserType={setSelectedType}
            onQuestionClick={setLastQuestion}
          />
          <GuideMessage message={streamingMessage} isLastMessage />
          <GuideMessage
            message={toolMessage}
            isLastMessage
            onSelectUserType={setSelectedType}
            onLoginSuccess={() => undefined}
            onQuestionClick={setLastQuestion}
            onClaimStart={() => setClaimStarted(true)}
            onClaimDetected={() => undefined}
          />
        </Stack>
      </Paper>
      <Group gap="lg">
        <Text size="sm" c="dimmed">
          Selected user type: {selectedType ?? 'None'}
        </Text>
        <Text size="sm" c="dimmed">
          Last question: {lastQuestion || 'None'}
        </Text>
        <Text size="sm" c="dimmed">
          Claim started: {claimStarted ? 'Yes' : 'No'}
        </Text>
      </Group>
    </Stack>
  )
}

function ActionSurface({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed" mb="xs">
        {label}
      </Text>
      {children}
    </Paper>
  )
}

function GuideStoryEnvironment() {
  settingsStore.setState((state) => ({
    ...state,
    language: 'en',
    languageInited: true,
    licenseKey: sampleLicense.key,
  }))
  return null
}

function toolPart(toolName: GuideToolName, toolCallId: string, result?: Record<string, unknown>): GuideToolPart {
  return {
    type: `tool-${toolName}`,
    toolName,
    toolCallId,
    state: 'result',
    result: result ?? { displayed: true },
  }
}

const userMessage: GuideUIMessage = {
  id: 'guide-user-message',
  role: 'user',
  content: 'I am new to AI tools. Please help me set up Chatbox.',
  parts: [{ type: 'text', text: 'I am new to AI tools. Please help me set up Chatbox.' }],
}

const assistantGreetingMessage: GuideUIMessage = {
  id: 'guide-assistant-greeting',
  role: 'assistant',
  content: 'Welcome to Chatbox. First, tell me about your AI experience.',
  parts: [
    {
      type: 'text',
      text: 'Welcome to Chatbox. First, tell me about your AI experience.',
    },
    toolPart('show_user_type_cards', 'guide-user-type-cards'),
    toolPart('show_suggested_questions', 'guide-suggested-questions'),
  ],
}

const streamingMessage: GuideUIMessage = {
  id: 'guide-streaming',
  role: 'assistant',
  content: '',
  parts: [],
  isStreaming: true,
}

const toolMessage: GuideUIMessage = {
  id: 'guide-tool-message',
  role: 'assistant',
  content: 'Your account is ready. You can review the license or start a fresh chat.',
  parts: [
    {
      type: 'text',
      text: 'Your account is ready. You can review the license, open provider settings, claim the free plan, or start a fresh chat.',
    },
    toolPart('show_login_button', 'guide-login'),
    toolPart('show_provider_settings_button', 'guide-provider-settings'),
    toolPart('show_free_trial_link', 'guide-free-trial'),
    toolPart('show_claim_waiting', 'guide-claim-waiting'),
    toolPart('show_view_license_button', 'guide-view-license'),
    toolPart('show_new_chat_button', 'guide-new-chat', { label: 'Start chatting now' }),
    toolPart('show_new_chat_tip', 'guide-new-chat-tip'),
  ],
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
