import { Box, Text } from '@mantine/core'
import type { Message, MessageToolCallPart, Session } from '@shared/types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { notifyApprovalInputNudge } from '@/stores/approvalAttentionStore'
import PendingApprovalPill from '../chat/PendingApprovalPill'
import { StepTimelineUI } from '../message-parts/ToolCallPartUI'

const storyQueryClient = new QueryClient()

// Simulates the session layout: an approval card inside a scrollable message list and
// the floating approval pill anchored above the input box. Scroll the card out of view
// to see the pill appear; "View" scrolls back and flashes a highlight on the card.

const pausedPart: MessageToolCallPart = {
  type: 'tool-call',
  state: 'paused',
  toolCallId: 'story-approval-tool-call',
  toolName: 'user_exec',
  args: { command: 'agent-reach doctor --json' },
  pauseReason: {
    type: 'user_exec_approval',
    command: 'agent-reach doctor --json',
    explanation:
      '该命令运行 agent-reach 的诊断检查并输出 JSON 结果，与用户抓取 SpaceX 新闻的需求不符，可能产生副作用或执行未知代码，需人工审查。',
  },
} as MessageToolCallPart

const message = {
  id: 'story-message',
  role: 'assistant',
  contentParts: [pausedPart],
} as unknown as Message

const session = {
  id: 'story-session',
  type: 'chat',
  name: 'Approval pill story',
  messages: [message],
} as unknown as Session

const meta: Meta<typeof PendingApprovalPill> = {
  title: 'Real Components/PendingApprovalPill',
  component: PendingApprovalPill,
  decorators: [
    (Story) => (
      <QueryClientProvider client={storyQueryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta

export const ApprovalCardWithFloatingPill: StoryObj = {
  name: 'Approval card + floating pill',
  render: () => (
    <Box style={{ height: 480, maxWidth: 720, display: 'flex', flexDirection: 'column', margin: '0 auto' }}>
      <Box style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* 模拟真实布局：审批卡片位于消息流底部，上方是历史消息。
            向上滚动查看历史（卡片落到视口下方）或折叠步骤时，悬浮胶囊出现。 */}
        <Box style={{ height: 900, paddingBottom: 24 }}>
          <Text size="sm" c="chatbox-tertiary">
            （历史消息占位）↑ 向上滚动查看历史后，下方审批卡片离开视口，悬浮胶囊会出现在输入框上方
          </Text>
        </Box>
        <StepTimelineUI
          parts={[pausedPart]}
          message={message}
          sessionId={session.id}
          messageId={message.id}
          onCopyReasoningContent={() => () => {}}
        />
      </Box>
      <Box style={{ position: 'relative', padding: '0 16px 16px' }}>
        <Box style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 8 }}>
          <PendingApprovalPill session={session} />
        </Box>
        <Box
          onClick={() => notifyApprovalInputNudge('story-approval-tool-call')}
          style={{
            minHeight: 92,
            borderRadius: 8,
            border: '0.5px solid var(--chatbox-border-primary)',
            backgroundColor: 'var(--chatbox-background-secondary)',
            padding: '8px 12px',
            color: 'var(--chatbox-tint-placeholder)',
            fontSize: 14,
          }}
        >
          等待批准（点击这里模拟点击锁定输入框 → 胶囊出现）
        </Box>
      </Box>
    </Box>
  ),
}
