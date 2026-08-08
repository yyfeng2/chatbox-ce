import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { IconArrowRight, IconClockHour4 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useLanguage } from '@/stores/settingsStore'

export interface AgentModeRewardClaimSuccessProps {
  tokenLimit: number
  expiresAt: string
}

export function formatRewardClaimDetails({
  tokenLimit,
  expiresAt,
  language,
}: AgentModeRewardClaimSuccessProps & { language: string }) {
  const points = new Intl.NumberFormat(language).format(tokenLimit)
  const expiresAtDate = new Date(expiresAt)
  const expiry = Number.isNaN(expiresAtDate.getTime())
    ? expiresAt
    : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(expiresAtDate)
  return { points, expiry }
}

const AgentModeRewardClaimSuccess = NiceModal.create(({ tokenLimit, expiresAt }: AgentModeRewardClaimSuccessProps) => {
  const modal = useModal()
  const { t } = useTranslation()
  const language = useLanguage()
  const { points, expiry } = formatRewardClaimDetails({ tokenLimit, expiresAt, language })

  const close = () => {
    modal.resolve()
    modal.hide()
  }

  return (
    <AdaptiveModal opened={modal.visible} onClose={close} centered title={t('A limited-time Work Mode gift')}>
      <Stack gap="lg">
        <Stack align="center" gap={8}>
          <Text size="xl" fw={700} ta="center" c="chatbox-primary">
            {t('Congratulations! Your bonus points are here')}
          </Text>
          <Text size="sm" c="chatbox-secondary" ta="center" maw={400} lh={1.65}>
            {t('These limited-time points are a gift for you. Enjoy the full power of Work Mode on complex tasks.')}
          </Text>
        </Stack>

        <Paper
          withBorder
          radius="md"
          p="md"
          style={{
            borderColor: 'var(--chatbox-border-brand)',
            background:
              'linear-gradient(135deg, var(--chatbox-background-brand-secondary), var(--chatbox-background-primary))',
          }}
        >
          <Stack gap="md">
            <Box>
              <Text size="xs" fw={600} c="chatbox-secondary">
                {t('Gifted points')}
              </Text>
              <Text size="32px" fw={750} c="chatbox-brand" lh={1.2} mt={2}>
                {points}
              </Text>
            </Box>

            <Group gap={8} wrap="nowrap" align="center">
              <IconClockHour4 size={16} className="shrink-0 text-chatbox-tint-tertiary" />
              <Text size="xs" c="chatbox-tertiary">
                {t('Valid until {{expiry}}', { expiry })}
              </Text>
            </Group>
          </Stack>
        </Paper>

        <AdaptiveModal.Actions>
          <Button onClick={close} rightSection={<IconArrowRight size={16} />}>
            {t('Continue with Work Mode')}
          </Button>
        </AdaptiveModal.Actions>
      </Stack>
    </AdaptiveModal>
  )
})

export default AgentModeRewardClaimSuccess
