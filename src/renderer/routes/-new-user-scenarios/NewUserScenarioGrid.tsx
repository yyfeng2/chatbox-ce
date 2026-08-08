import { Box, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import iconBrowserWindow from '@/static/chat/icon-browser-window.svg'
import iconChat from '@/static/chat/icon-chat.svg'
import iconCursor from '@/static/chat/icon-cursor.svg'
import iconHeart from '@/static/chat/icon-heart.svg'
import iconPan from '@/static/chat/icon-pan.svg'
import iconSummary from '@/static/chat/icon-summary.svg'
import type { NewUserScenario, ScenarioIcon } from './scenarios'

interface NewUserScenarioGridProps {
  scenarios: NewUserScenario[]
  onSelect?: (scenario: NewUserScenario) => void
}

const scenarioIconMap = {
  document: iconSummary,
  resume: iconChat,
  academic: iconCursor,
  exam: iconPan,
  webpage: iconBrowserWindow,
  story: iconHeart,
} satisfies Record<ScenarioIcon, string>

export function NewUserScenarioGrid({ scenarios, onSelect }: NewUserScenarioGridProps) {
  const { t } = useTranslation()

  return (
    <Stack gap="lg" className="w-full max-w-5xl mx-auto px-md md:px-[60px] sm:gap-xl">
      <Stack gap={6}>
        <Text
          fw={700}
          className="text-chatbox-tint-primary"
          style={{
            fontSize: 28,
            lineHeight: 1.2,
          }}
        >
          {t('What would you like Chatbox to help with?')}
        </Text>
        <Text size="md" className="text-chatbox-tint-secondary">
          {t('Choose a scenario to explore Chatbox, or type your own question below.')}
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 2, sm: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'md' }}>
        {scenarios.map((scenario) => {
          const iconSrc = scenarioIconMap[scenario.icon]
          const title = t(scenario.titleKey)
          const description = t(scenario.descriptionKey)

          return (
            <UnstyledButton
              key={scenario.id}
              onClick={() => onSelect?.(scenario)}
              aria-label={`${title}: ${description}`}
              className="group min-h-[96px] rounded-lg border border-solid border-[var(--chatbox-border-primary)] bg-chatbox-background-primary px-sm py-sm text-center transition-colors hover:bg-[rgba(34,139,230,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chatbox-brand)] sm:min-h-[132px] sm:px-md sm:pt-md sm:pb-lg sm:text-left"
            >
              <Stack gap="xs" h="100%" className="items-center sm:items-start sm:gap-sm">
                <Box className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(34,139,230,0.1)] text-chatbox-tint-brand transition-colors group-hover:bg-[rgba(34,139,230,0.16)] sm:h-11 sm:w-11">
                  <img src={iconSrc} alt="" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                </Box>
                <Stack gap={4}>
                  <Text fw={600} size="sm" className="text-chatbox-tint-primary sm:text-base" lineClamp={2}>
                    {title}
                  </Text>
                  <Text size="sm" className="hidden text-chatbox-tint-secondary sm:block" lineClamp={2}>
                    {description}
                  </Text>
                </Stack>
              </Stack>
            </UnstyledButton>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}
