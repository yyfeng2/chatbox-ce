import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core'
import type { Session } from '@shared/types'
import { MessageRoleEnum } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconRobot } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { uiStore } from '@/stores/uiStore'
import { AssistantAvatar, SystemAvatar, UserAvatar } from '../common/Avatar'
import { CompressionModal } from '../common/CompressionModal'
import Divider from '../common/Divider'
import { ErrorBoundary } from '../common/ErrorBoundary'
import LinkTargetBlank from '../common/Link'
import Mark from '../common/Mark'
import { ScalableIcon } from '../common/ScalableIcon'
import SegmentedControl from '../common/SegmentedControl'
import Toasts from '../common/Toasts'

const meta: Meta = {
  title: 'Real Components/Common Feedback',
  decorators: [
    (Story) => (
      <Box p="lg" bg="var(--chatbox-background-primary)" style={{ maxWidth: 900, minHeight: 540 }}>
        <Story />
      </Box>
    ),
  ],
}

export default meta

export const AvatarStates: StoryObj = {
  name: 'Avatar user assistant system chat picture states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/common/Avatar'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="Avatar"
        description="Actual user, assistant, system, chat, and picture avatar variants used in session and message rows."
      />
      <Group>
        <AvatarSample label="User">
          <UserAvatar size="lg" />
        </AvatarSample>
        <AvatarSample label="Assistant">
          <AssistantAvatar size="lg" />
        </AvatarSample>
        <AvatarSample label="Chat icon">
          <AssistantAvatar size="lg" type="chat" />
        </AvatarSample>
        <AvatarSample label="Picture">
          <AssistantAvatar size="lg" sessionType="picture" />
        </AvatarSample>
        <AvatarSample label="System">
          <SystemAvatar size="lg" />
        </AvatarSample>
      </Group>
    </Stack>
  ),
}

export const CompressionModalStates: StoryObj = {
  name: 'Compression modal opened confirmation state',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/common/CompressionModal'],
  },
  render: () => {
    const [opened, setOpened] = useState(true)
    return (
      <Stack gap="lg">
        <SurfaceLabel
          title="CompressionModal"
          description="Actual conversation compression confirmation modal used before forced context compaction."
        />
        <Button onClick={() => setOpened(true)}>Open compression modal</Button>
        <CompressionModal opened={opened} onClose={() => setOpened(false)} session={compressionSession} />
      </Stack>
    )
  },
}

export const ErrorBoundaryStates: StoryObj = {
  name: 'Error boundary fallback and retry states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/common/ErrorBoundary'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel
        title="ErrorBoundary"
        description="Actual Sentry-backed error boundary with the default app fallback, retry, reload, and details states."
      />
      <Paper withBorder radius="md" h={420} style={{ overflow: 'hidden' }}>
        <ErrorBoundary name="StorybookErrorBoundary">
          <ThrowOnRender />
        </ErrorBoundary>
      </Paper>
    </Stack>
  ),
}

export const InlineUtilityStates: StoryObj = {
  name: 'Divider link mark scalable icon and segmented control states',
  parameters: {
    uiInventoryTargets: [
      'src/renderer/components/common/Divider',
      'src/renderer/components/common/Link',
      'src/renderer/components/common/Mark',
      'src/renderer/components/common/ScalableIcon',
      'src/renderer/components/common/SegmentedControl',
    ],
  },
  render: () => {
    const [segment, setSegment] = useState('chat')
    return (
      <Stack gap="lg">
        <SurfaceLabel
          title="Inline common utilities"
          description="Actual utility components used throughout settings, message content, and toolbar controls."
        />
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group>
              <ScalableIcon icon={IconRobot} size={20} className="text-chatbox-tint-brand" />
              <ScalableIcon icon={IconInfoCircle} size={20} className="text-chatbox-tint-secondary" />
              <ScalableIcon icon={IconAlertTriangle} size={20} className="text-chatbox-tint-error" />
            </Group>
            <Divider />
            <Group h={36}>
              <Text size="sm">Vertical divider</Text>
              <Divider orientation="vertical" className="h-full" />
              <LinkTargetBlank href="https://chatboxai.app">Chatbox homepage link</LinkTargetBlank>
            </Group>
            <Mark marks={['search', 'highlight']}>
              {'Search results highlight matching content inside long assistant responses.'}
            </Mark>
            <SegmentedControl
              value={segment}
              onChange={setSegment}
              data={[
                { label: 'Chat', value: 'chat' },
                { label: 'Task', value: 'task' },
                { label: 'Files', value: 'files' },
              ]}
            />
          </Stack>
        </Paper>
      </Stack>
    )
  },
}

export const ToastStates: StoryObj = {
  name: 'Toast stack top-right feedback states',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/common/Toasts'],
  },
  render: () => (
    <Stack gap="lg">
      <SurfaceLabel title="Toasts" description="Actual global toast renderer backed by the shared UI store." />
      <SeedToasts />
      <Paper withBorder radius="md" p="md">
        <Group gap="xs">
          <ScalableIcon icon={IconCheck} size={16} className="text-chatbox-tint-success" />
          <Text size="sm">Toast store is populated; notifications render in the production Snackbar stack.</Text>
        </Group>
      </Paper>
      <Toasts />
    </Stack>
  ),
}

function AvatarSample({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack align="center" gap="xs">
        {children}
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Paper>
  )
}

function SeedToasts() {
  useEffect(() => {
    uiStore.setState({
      toasts: [
        { id: 'storybook-toast-saved', content: 'Settings saved', duration: 60_000 },
        { id: 'storybook-toast-failed', content: 'Failed to sync provider models', duration: 60_000 },
      ],
    })

    return () => {
      uiStore.setState({ toasts: [] })
    }
  }, [])

  return null
}

function ThrowOnRender(): never {
  throw new Error('Storybook preview error for fallback state')
}

const compressionSession: Session = {
  id: 'storybook-compression-session',
  name: 'Long support conversation',
  type: 'chat',
  picUrl: '',
  messages: [
    {
      id: 'msg-user',
      role: MessageRoleEnum.User,
      contentParts: [{ type: 'text', text: 'Please summarize the launch discussion.' }],
      timestamp: Date.now(),
      tokenCalculatedAt: 0,
    },
    {
      id: 'msg-assistant',
      role: MessageRoleEnum.Assistant,
      contentParts: [{ type: 'text', text: 'The discussion covers release timing, support load, and QA risk.' }],
      timestamp: Date.now(),
      tokenCalculatedAt: 0,
    },
  ],
  threads: [],
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
