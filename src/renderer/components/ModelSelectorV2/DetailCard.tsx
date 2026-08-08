import { Button, Flex, Stack, Text } from '@mantine/core'
import { IconDatabase } from '@tabler/icons-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '../common/ScalableIcon'
import { ModelIcon } from '../icons/ModelIcon'
import { CapabilityIconRow } from './CapabilityIconRow'
import { CARD_SURFACE_STYLE, MODEL_SELECTOR_SURFACE_CLASS } from './constants'
import { getCostLabel, getCostLevelBarCount } from './helpers'
import type { DetailModel } from './types'

const COST_LEVEL_BAR_IDS = ['cost-level-bar-1', 'cost-level-bar-2', 'cost-level-bar-3'] as const

function CostLevelIndicator({
  costLevel,
  costLabel,
  t,
}: {
  costLevel?: string
  costLabel: string
  t: (key: string) => string
}) {
  const filledBarCount = getCostLevelBarCount(costLevel)
  const bars = COST_LEVEL_BAR_IDS.map((barId, index) => {
    const filled = index < filledBarCount
    return (
      <span
        key={barId}
        aria-hidden
        className={clsx(
          'h-2 w-[34.5px] rounded-[3px] border border-solid border-chatbox-tint-primary',
          filled ? 'bg-chatbox-tint-primary' : 'bg-transparent'
        )}
      />
    )
  })

  return (
    <Stack gap={8}>
      <Text size="sm" fw={750} c="chatbox-secondary">
        {t('Pricing')}
      </Text>
      <Flex gap={8} wrap="nowrap" aria-label={`Cost level ${filledBarCount} of 3`}>
        {bars}
      </Flex>
      {costLabel && (
        <Flex align="center" gap={6} className="self-start text-chatbox-tint-warning">
          <ScalableIcon icon={IconDatabase} size={13} className="text-inherit" />
          <Text span size="sm" c="inherit">
            {costLabel}
          </Text>
        </Flex>
      )}
    </Stack>
  )
}

export function DetailCard({ model, onClose, mobile }: { model: DetailModel; onClose?: () => void; mobile?: boolean }) {
  const { t } = useTranslation()
  const costLabel = getCostLabel(model.costLevel, t)
  return (
    <Stack
      gap={mobile ? 'md' : 'md'}
      className={clsx(
        'relative border border-solid text-chatbox-tint-primary',
        MODEL_SELECTOR_SURFACE_CLASS,
        mobile ? 'm-[4px] border-0 px-4 pb-4 pt-3 rounded-[12px]' : 'm-[4px] w-[320px] rounded-[12px] px-4 pb-4 pt-4'
      )}
      style={mobile ? undefined : CARD_SURFACE_STYLE}
    >
      <Flex align="center" gap="md">
        <ModelIcon providerId={model.providerId} modelId={model.modelId} size={mobile ? 34 : 30} />
        <Text fw={750} size={mobile ? 'xl' : 'lg'} lh={1.16} className="min-w-0 flex-1 break-words">
          {model.name}
        </Text>
      </Flex>
      {model.description && (
        <Text size={mobile ? 'md' : 'sm'} c="chatbox-secondary" className="leading-relaxed">
          {model.description}
        </Text>
      )}
      <CostLevelIndicator costLevel={model.costLevel} costLabel={costLabel} t={t} />
      <Stack gap="xs" mt="sm">
        <Text size="sm" fw={750} c="chatbox-secondary">
          {t('Capabilities')}
        </Text>
        <CapabilityIconRow capabilities={model.capabilities} />
      </Stack>
      {model.disabledReason && (
        <Text size="sm" c="chatbox-tertiary" ta="center" mt={mobile ? 'xs' : 0}>
          {model.disabledReason}
        </Text>
      )}
      {onClose && (
        <Flex gap="sm" mt={mobile ? 'md' : 'sm'}>
          <Button
            variant="default"
            size={mobile ? 'md' : 'sm'}
            onClick={onClose}
            className="flex-shrink-0"
            styles={{ root: { height: mobile ? 46 : 42, minHeight: mobile ? 46 : 42, minWidth: mobile ? 88 : 76 } }}
          >
            {t('Close')}
          </Button>
        </Flex>
      )}
    </Stack>
  )
}
