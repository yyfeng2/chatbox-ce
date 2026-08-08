import { Flex, Text, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { type FC, memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ForkMarkerMessageProps {
  sourceSessionId?: string
  className?: string
}

const ForkMarkerMessage: FC<ForkMarkerMessageProps> = ({ sourceSessionId, className }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleOpenSourceSession = useCallback(() => {
    if (!sourceSessionId) {
      return
    }
    void navigate({ to: '/session/$sessionId', params: { sessionId: sourceSessionId } })
  }, [navigate, sourceSessionId])

  const markerContent = (
    <Flex
      align="center"
      gap="xxs"
      className={cn(
        'select-none px-3 py-1 rounded-full bg-chatbox-background-secondary',
        sourceSessionId && 'cursor-pointer hover:bg-chatbox-background-secondary-hover transition-colors'
      )}
    >
      <Text size="xs" c="chatbox-tertiary" className="whitespace-nowrap">
        {t('Forked from conversation')}
      </Text>
    </Flex>
  )

  return (
    <div className={cn('w-full py-4', className)}>
      <Flex align="center" gap="xs" className="w-full">
        <div className="flex-1 h-px bg-chatbox-border-primary" />
        {sourceSessionId ? (
          <UnstyledButton
            type="button"
            aria-label={t('Forked from conversation')}
            onClick={handleOpenSourceSession}
            className="rounded-full"
          >
            {markerContent}
          </UnstyledButton>
        ) : (
          markerContent
        )}
        <div className="flex-1 h-px bg-chatbox-border-primary" />
      </Flex>
    </div>
  )
}

export default memo(ForkMarkerMessage)
