import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { ActionIcon, Flex, Text } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import type { SessionMetaRecord } from '@shared/types'
import { IconArrowsMoveVertical, IconPinned, IconPinnedFilled, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { type MouseEvent, memo, type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import platform from '@/platform'
import { router } from '@/router'
import { confirmSessionDeletion, deleteSession, updateSession as updateSessionStore } from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/sessionActions'
import { useUIStore } from '@/stores/uiStore'
import ActionMenu, { type ActionMenuItemProps } from '../ActionMenu'
import { AssistantAvatar } from '../common/Avatar'
import { ScalableIcon } from '../common/ScalableIcon'

const MOBILE_LONG_PRESS_DELAY = 550
const MOBILE_LONG_PRESS_MOVE_TOLERANCE = 10

function formatSessionTime(createdAt: number) {
  const created = dayjs(createdAt)
  const now = dayjs()
  if (created.isSame(now, 'day')) {
    return created.format('HH:mm')
  }
  if (created.isSame(now, 'year')) {
    return created.format('MM/DD')
  }
  return created.format('YY/MM/DD')
}

function triggerLongPressHaptic() {
  if (platform.type === 'mobile') {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
      navigator.vibrate?.(10)
    })
    return
  }
  navigator.vibrate?.(10)
}

export interface Props {
  session: SessionMetaRecord
  selected: boolean
  isReordering?: boolean
  onStartReordering?: () => void
}

function SessionItem(props: Props) {
  const { session, selected } = props
  const { t } = useTranslation()
  const pinActionLabel = session.starred ? t('Unpin') : t('Pin')
  const deleteActionLabel = t('Delete')
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const onClick = () => {
    if (props.isReordering) {
      return
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    switchCurrentSession(session.id)
    if (isSmallScreen) {
      setShowSidebar(false)
    }
  }
  const isSmallScreen = useIsSmallScreen()
  // const smallSize = theme.typography.pxToRem(20)

  const [deleting, setDeleting] = useState(false)
  const [actionTooltipDismissed, setActionTooltipDismissed] = useState(false)
  const [mobileMenuOpened, setMobileMenuOpened] = useState(false)
  const [longPressing, setLongPressing] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)
  const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null)

  const stopItemClick = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }

  const dismissActionTooltip = () => {
    setActionTooltipDismissed(true)
  }

  const deleteCurrentSession = async () => {
    if (deleting) {
      return
    }
    setDeleting(true)
    try {
      if (!(await confirmSessionDeletion(session.id))) {
        return
      }
      await deleteSession(session.id)
      if (selected) {
        await router.navigate({ to: '/', replace: true })
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    } finally {
      setDeleting(false)
    }
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartPointRef.current = null
    setLongPressing(false)
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (!isSmallScreen || props.isReordering) {
      return
    }
    clearLongPressTimer()
    longPressTriggeredRef.current = false
    longPressStartPointRef.current = { x: event.clientX, y: event.clientY }
    setLongPressing(true)
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setLongPressing(false)
      triggerLongPressHaptic()
      setMobileMenuOpened(true)
    }, MOBILE_LONG_PRESS_DELAY)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (!isSmallScreen || !longPressStartPointRef.current) {
      return
    }
    const deltaX = Math.abs(event.clientX - longPressStartPointRef.current.x)
    const deltaY = Math.abs(event.clientY - longPressStartPointRef.current.y)
    if (deltaX > MOBILE_LONG_PRESS_MOVE_TOLERANCE || deltaY > MOBILE_LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPressTimer()
    }
  }

  const handlePointerLeave = () => {
    clearLongPressTimer()
    setActionTooltipDismissed(false)
  }

  const handleContextMenu = (event: MouseEvent) => {
    if (!isSmallScreen) {
      return
    }
    event.preventDefault()
  }

  const handleMobileMenuChange = (opened: boolean) => {
    setMobileMenuOpened(opened)
    if (!opened) {
      clearLongPressTimer()
      longPressTriggeredRef.current = false
    }
  }

  const mobileMenuItems: ActionMenuItemProps[] = [
    {
      text: pinActionLabel || '',
      icon: session.starred ? IconPinnedFilled : IconPinned,
      onClick: () => {
        void updateSessionStore(session.id, { starred: !session.starred })
      },
    },
    {
      text: t('Adjust order') || '',
      icon: IconArrowsMoveVertical,
      disabled: !props.onStartReordering,
      onClick: props.onStartReordering,
    },
    {
      text: deleteActionLabel || '',
      icon: IconTrash,
      disabled: deleting,
      onClick: () => {
        void deleteCurrentSession()
      },
    },
  ]

  const content = (
    <Flex
      data-testid={TestId.sidebar.sessionItem}
      data-session-id={session.id}
      align="center"
      className={clsx(
        'cursor-pointer rounded-lg group/session-item',
        'select-none',
        props.isReordering && 'cursor-default',
        isSmallScreen
          ? props.isReordering
            ? 'bg-chatbox-background-primary'
            : longPressing
              ? 'bg-chatbox-background-gray-secondary'
              : ''
          : selected
            ? 'bg-chatbox-background-brand-secondary'
            : 'hover:bg-chatbox-background-gray-secondary'
      )}
      mx="xs"
      pl="xs"
      pr={props.isReordering ? 44 : 'xs'}
      py={8}
      gap={10}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={clearLongPressTimer}
    >
      <AssistantAvatar
        avatarKey={session.assistantAvatarKey}
        picUrl={session.picUrl}
        sessionType={session.type}
        size="sm"
        type="chat"
        c={selected ? 'chatbox-brand' : 'chatbox-primary'}
      />

      <Text
        data-testid={TestId.sidebar.sessionTitle}
        span
        flex={1}
        lineClamp={1}
        c={selected ? 'chatbox-brand' : 'chatbox-primary'}
      >
        {session.name}
      </Text>

      {!isSmallScreen && (
        <Text
          span
          c="chatbox-disabled"
          className="shrink-0 text-[10px] tabular-nums opacity-50 group-hover/session-item:hidden"
        >
          {formatSessionTime(session.createdAt)}
        </Text>
      )}

      <Flex gap={2} className={clsx(isSmallScreen ? 'hidden' : 'group-hover/session-item:flex hidden')}>
        <Tooltip label={pinActionLabel} openDelay={1000} withArrow disabled={actionTooltipDismissed}>
          <ActionIcon
            data-testid={TestId.sidebar.sessionPin}
            aria-label={pinActionLabel}
            variant="transparent"
            size={20}
            color={session.starred ? 'chatbox-brand' : 'chatbox-tertiary'}
            onPointerDown={stopItemClick}
            onClick={(event) => {
              stopItemClick(event)
              dismissActionTooltip()
              void updateSessionStore(session.id, { starred: !session.starred })
            }}
          >
            {session.starred ? (
              <ScalableIcon icon={IconPinnedFilled} className="text-inherit" size={16} />
            ) : (
              <ScalableIcon icon={IconPinned} className="text-inherit" size={16} />
            )}
          </ActionIcon>
        </Tooltip>

        <Tooltip label={deleteActionLabel} openDelay={1000} withArrow disabled={actionTooltipDismissed}>
          <ActionIcon
            data-testid={TestId.sidebar.sessionDelete}
            aria-label={deleteActionLabel}
            variant="transparent"
            size={20}
            color="chatbox-tertiary"
            loading={deleting}
            onPointerDown={stopItemClick}
            onClick={async (event) => {
              stopItemClick(event)
              if (deleting) {
                return
              }
              dismissActionTooltip()
              await deleteCurrentSession()
            }}
          >
            <ScalableIcon icon={IconTrash} className="text-inherit" size={16} />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Flex>
  )

  if (!isSmallScreen) {
    return content
  }

  return (
    <ActionMenu
      type="contextual"
      trigger="manual"
      items={mobileMenuItems}
      opened={mobileMenuOpened}
      onChange={handleMobileMenuChange}
      position="bottom-end"
      offset={0}
    >
      {content}
    </ActionMenu>
  )
}

export default memo(SessionItem)
