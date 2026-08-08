import { Box, Group, Stack, Text, Timeline } from '@mantine/core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import i18n from '@/i18n'
import { AgentModeRewardQuotaCard } from '../chat/AgentModeRewardQuotaCard'
import { AssistantAvatar } from '../common/Avatar'

const meta: Meta<typeof AgentModeRewardQuotaCard> = {
  title: 'Design Mockups/Agent Mode Reward Quota Card',
  component: AgentModeRewardQuotaCard,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'light' },
    docs: {
      description: {
        component:
          'The production component for the dedicated Free-plan Work Mode quota reward error, shown inside a real assistant message context.',
      },
    },
  },
  decorators: [
    (Story) => (
      <Box bg="var(--chatbox-background-primary)" mih="100vh" p={36}>
        <Box maw={760} mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
}

export default meta

export const InAgentMessage: StoryObj<typeof AgentModeRewardQuotaCard> = {
  name: 'Inside a real assistant message',
  parameters: {
    uiInventoryTargets: ['src/renderer/components/chat/AgentModeRewardQuotaCard'],
  },
  render: () => <AgentMessageFixture />,
}

function AgentMessageFixture() {
  const [ready, setReady] = useState(i18n.language === 'zh-Hans')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const previousLanguage = i18n.language
    void i18n.changeLanguage('zh-Hans').then(() => setReady(true))
    return () => {
      void i18n.changeLanguage(previousLanguage)
    }
  }, [])

  if (!ready) {
    return null
  }

  return (
    <Group align="flex-start" wrap="nowrap" gap="sm">
      <AssistantAvatar size="lg" bg="var(--chatbox-background-brand-primary)" color="var(--chatbox-tint-white)" />
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" c="var(--chatbox-tint-secondary)" lh={1.65}>
          我已经读取了数据文件，正在完成趋势分析并准备生成可下载的报告。
        </Text>

        <Timeline
          active={3}
          bulletSize={18}
          lineWidth={1}
          color="teal"
          styles={{
            itemBody: { paddingBottom: 8 },
            itemBullet: {
              color: 'var(--chatbox-tint-white)',
              background: 'var(--chatbox-background-success-primary)',
              borderWidth: 0,
            },
          }}
        >
          <Timeline.Item bullet={<IconCheck size={11} stroke={2.4} />}>
            <Text size="xs" fw={600}>
              读取 sales-q2.xlsx
              <Text span c="var(--chatbox-tint-tertiary)" fw={400}>
                {' '}
                · 12 个工作表
              </Text>
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconCheck size={11} stroke={2.4} />}>
            <Text size="xs" fw={600}>
              运行数据清洗脚本
              <Text span c="var(--chatbox-tint-tertiary)" fw={400}>
                {' '}
                · 已处理 18,420 行
              </Text>
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconCheck size={11} stroke={2.4} />}>
            <Text size="xs" fw={600}>
              完成销售趋势分析
              <Text span c="var(--chatbox-tint-tertiary)" fw={400}>
                {' '}
                · 已保存结果
              </Text>
            </Text>
          </Timeline.Item>
        </Timeline>

        <AgentModeRewardQuotaCard
          loading={loading}
          onAction={() => {
            setLoading(true)
            window.setTimeout(() => setLoading(false), 1200)
          }}
        />
      </Stack>
    </Group>
  )
}
