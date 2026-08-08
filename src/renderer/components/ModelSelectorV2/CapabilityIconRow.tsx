import { Flex } from '@mantine/core'
import type { ProviderModelInfo } from '@shared/types'
import type { TablerIcon } from '@tabler/icons-react'
import { IconBulb, IconEye, IconTool } from '@tabler/icons-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '../common/ScalableIcon'

export type DetailCapabilityId = 'reasoning' | 'tool_use' | 'vision'

export const CAPABILITY_ICON_COLOR_CLASSES = {
  reasoning: 'text-amber-600',
  tool_use: 'text-emerald-600',
  vision: 'text-sky-600',
} satisfies Record<DetailCapabilityId, string>

export const CAPABILITY_STYLES = {
  reasoning: `bg-amber-50 ${CAPABILITY_ICON_COLOR_CLASSES.reasoning}`,
  tool_use: `bg-emerald-50 ${CAPABILITY_ICON_COLOR_CLASSES.tool_use}`,
  vision: `bg-sky-50 ${CAPABILITY_ICON_COLOR_CLASSES.vision}`,
} satisfies Record<DetailCapabilityId, string>

export function CapabilityIconRow({
  capabilities,
  compact,
}: {
  capabilities?: ProviderModelInfo['capabilities']
  compact?: boolean
}) {
  const { t } = useTranslation()
  const items = (
    [
      { id: 'vision', label: t('Vision'), icon: IconEye },
      { id: 'reasoning', label: t('Reasoning'), icon: IconBulb },
      { id: 'tool_use', label: t('Tool Use'), icon: IconTool },
    ] satisfies Array<{ id: DetailCapabilityId; label: string; icon: TablerIcon }>
  ).filter((item) => capabilities?.includes(item.id))

  if (items.length === 0) return null

  return (
    <Flex gap="xs" wrap="wrap">
      {items.map((item) => (
        <Flex
          key={item.id}
          align="center"
          gap={4}
          className={clsx(
            'rounded-lg font-semibold',
            CAPABILITY_STYLES[item.id],
            compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          )}
        >
          <ScalableIcon icon={item.icon} size={compact ? 13 : 15} />
          <span>{item.label}</span>
        </Flex>
      ))}
    </Flex>
  )
}
