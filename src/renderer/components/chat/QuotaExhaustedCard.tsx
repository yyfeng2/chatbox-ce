import { Box, Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconArrowUpRight, IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

interface QuotaExhaustedCardProps {
  kind: 'quota-exhausted' | 'free-quota-exhausted' | 'ocr-quota-exhausted' | 'free-ocr-quota-exhausted'
  onUpgrade: () => void
  onConfigureOcr?: () => void
}

export function QuotaExhaustedCard({ kind, onUpgrade, onConfigureOcr }: QuotaExhaustedCardProps) {
  const { t } = useTranslation()
  const isOcrQuota = kind === 'ocr-quota-exhausted' || kind === 'free-ocr-quota-exhausted'
  const isFreeQuota = kind === 'free-quota-exhausted' || kind === 'free-ocr-quota-exhausted'

  let description: string
  if (kind === 'ocr-quota-exhausted') {
    description = t(
      'The current model uses Chatbox AI OCR to process images, and its quota for the current period is used up. Upgrade your plan or change the default OCR model to continue.'
    )
  } else if (kind === 'free-ocr-quota-exhausted') {
    description = t(
      "The current model uses Chatbox AI OCR to process images, and today's free OCR points are used up. Free points reset daily; upgrade your plan or change the default OCR model to continue."
    )
  } else if (isFreeQuota) {
    description = t("Today's free points are used up. Free points reset daily; upgrade your plan to continue now.")
  } else {
    description = t('Your quota for the current period is used up. Upgrade your plan to continue.')
  }

  return (
    <Paper
      role="status"
      radius={8}
      p={16}
      withBorder
      style={{
        borderColor: 'var(--chatbox-border-primary)',
        background: 'var(--chatbox-background-primary)',
      }}
    >
      <Group align="flex-start" wrap="nowrap" gap={14}>
        <ThemeIcon
          size={38}
          radius="50%"
          variant="light"
          style={{
            flexShrink: 0,
            color: 'var(--chatbox-tint-brand)',
            background: 'var(--chatbox-background-brand-secondary)',
          }}
        >
          <IconInfoCircle size={20} stroke={1.8} />
        </ThemeIcon>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={4}>
            <Text size="sm" fw={600} lh={1.45}>
              {isOcrQuota ? t('Chatbox AI OCR points are used up') : t('Your points are used up')}
            </Text>
            <Text size="13px" c="var(--chatbox-tint-secondary)" lh={1.6}>
              {description}
            </Text>
          </Stack>

          <Group mt={10} gap={8}>
            <Button
              h={32}
              px={14}
              radius={6}
              size="xs"
              rightSection={<IconArrowUpRight size={14} stroke={2} />}
              onClick={onUpgrade}
              style={{
                fontWeight: 600,
                color: 'var(--chatbox-tint-white)',
                background: 'var(--chatbox-background-brand-primary)',
              }}
            >
              {t('Upgrade plan')}
            </Button>
            {isOcrQuota && onConfigureOcr && (
              <Button h={32} px={14} radius={6} size="xs" variant="light" onClick={onConfigureOcr}>
                {t('OCR model settings')}
              </Button>
            )}
          </Group>
        </Box>
      </Group>
    </Paper>
  )
}
