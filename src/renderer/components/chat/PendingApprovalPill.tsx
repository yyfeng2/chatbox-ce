import { Box, Button, Text, Transition, UnstyledButton } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import { getApprovalPreview, listPendingApprovalToolCalls } from '@shared/message-approval'
import type { Session } from '@shared/types'
import { IconArrowUp } from '@tabler/icons-react'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import {
  clearApprovalInputNudge,
  revealApprovalCard,
  useApprovalNudged,
  useIsApprovalCardVisible,
} from '@/stores/approvalAttentionStore'
import { continuePausedToolCall, stopPausedToolCall } from '@/stores/sessionActions'

/**
 * Floating pill above the input box while a tool call waits for approval. The full
 * approval card stays in the message list; the pill appears when the card's actions
 * are out of the viewport, or when the user clicks the locked input (the nudge).
 * It offers View (scroll back + locate ring) plus direct Approve / Deny. With
 * multiple pending approvals it targets the first one.
 */
const PendingApprovalPill: FC<{ session: Session }> = ({ session }) => {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const pendingApprovals = useMemo(() => listPendingApprovalToolCalls(session.messages), [session.messages])
  const current = pendingApprovals[0]
  const cardVisible = useIsApprovalCardVisible(current?.toolCallId ?? '')
  const nudged = useApprovalNudged(current?.toolCallId ?? '')
  if (!current) return null

  const preview = getApprovalPreview(current.pauseReason)
  return (
    <Transition mounted={!cardVisible || nudged} transition="slide-up" duration={200}>
      {(transitionStyle) => (
        <Box className="flex justify-center" style={transitionStyle}>
          <Box
            data-testid={TestId.toolCall.approvalPill}
            className="pointer-events-auto flex items-center"
            style={{
              gap: 10,
              maxWidth: '100%',
              backgroundColor: 'var(--chatbox-background-primary)',
              border: '1px solid var(--chatbox-border-primary)',
              borderRadius: 999,
              padding: '6px 8px 6px 14px',
              boxShadow: '0 8px 24px -6px rgba(0,0,0,0.18)',
            }}
          >
            <Box
              component="span"
              className="animate-pulse shrink-0"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: 'var(--chatbox-tint-warning)',
              }}
            />
            {/* The label is the only flexible element: on narrow viewports it truncates
                so the Approve/Deny actions always stay on screen. */}
            <Text size="sm" fw={500} c="chatbox-primary" truncate="end" style={{ minWidth: 0 }}>
              {t('{{count}} operation(s) awaiting approval', { count: pendingApprovals.length })}
            </Text>
            {!isSmallScreen && preview && (
              <Text
                size="xs"
                c="chatbox-secondary"
                truncate="end"
                className="font-mono"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--chatbox-background-gray-secondary) 72%, transparent)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  maxWidth: 220,
                }}
              >
                {preview}
              </Text>
            )}
            <UnstyledButton
              data-testid={TestId.toolCall.approvalPillView}
              className="shrink-0 flex items-center"
              style={{ gap: 2, color: 'var(--chatbox-tint-brand)', fontSize: 'var(--mantine-font-size-xs)' }}
              onClick={() => {
                clearApprovalInputNudge()
                void revealApprovalCard(session.id, current.messageId, current.toolCallId)
              }}
            >
              {t('View')}
              <IconArrowUp size={12} />
            </UnstyledButton>
            <Button
              data-testid={TestId.toolCall.approvalPillApprove}
              size="compact-sm"
              radius="xl"
              color="chatbox-brand"
              className="shrink-0"
              onClick={() => continuePausedToolCall(session.id, current.messageId, current.toolCallId)}
            >
              {t('Approve')}
            </Button>
            <Button
              data-testid={TestId.toolCall.approvalPillDeny}
              size="compact-sm"
              radius="xl"
              variant="light"
              color="chatbox-error"
              className="shrink-0"
              onClick={() => stopPausedToolCall(session.id, current.messageId, current.toolCallId)}
            >
              {t('Deny')}
            </Button>
          </Box>
        </Box>
      )}
    </Transition>
  )
}

export default PendingApprovalPill
