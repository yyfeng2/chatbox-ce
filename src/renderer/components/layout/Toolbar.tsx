import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Button, Flex } from '@mantine/core'
import {
  IconClearAll,
  IconCode,
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconHistory,
  IconId,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react'
import { useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsLargeScreen, useIsSmallScreen } from '@/hooks/useScreenChange'
import { copyToClipboard } from '@/packages/navigator'
import { router } from '@/router'
import * as atoms from '@/stores/atoms'
import { confirmSessionDeletion, deleteSession, getSession } from '@/stores/chatStore'
import { clear as clearSession, copyAndSwitchSession } from '@/stores/sessionActions'
import * as toastActions from '@/stores/toastActions'
import { useUIStore } from '@/stores/uiStore'
import ActionMenu from '../ActionMenu'
import { ScalableIcon } from '../common/ScalableIcon'
import Broom from '../icons/Broom'
import LayoutExpand from '../icons/LayoutExpand'
import LayoutShrink from '../icons/LayoutShrink'

/**
 * 顶部标题工具栏（右侧）
 * @returns
 */
export default function Toolbar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const isLargeScreen = useIsLargeScreen()

  const setOpenSearchDialog = useUIStore((s) => s.setOpenSearchDialog)
  const setThreadHistoryDrawerOpen = useSetAtom(atoms.showThreadHistoryDrawerAtom)
  const widthFull = useUIStore((s) => s.widthFull)
  const setWidthFull = useUIStore((s) => s.setWidthFull)

  const handleExportAndSave = () => {
    NiceModal.show('export-chat')
  }
  const handleSessionClean = () => {
    void clearSession(sessionId)
  }
  const handleSessionDelete = async () => {
    if (!(await confirmSessionDeletion(sessionId))) {
      return
    }
    try {
      await deleteSession(sessionId)
      router.navigate({ to: '/', replace: true })
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleViewSessionJson = useCallback(async () => {
    const session = await getSession(sessionId)
    if (session) {
      await NiceModal.show('json-viewer', { title: t('Session Raw JSON'), data: session })
    }
  }, [sessionId, t])

  const handleCopySession = useCallback(async () => {
    const session = await getSession(sessionId)
    if (session) {
      await copyAndSwitchSession(session)
    }
  }, [sessionId])

  const handleCopySessionId = useCallback(() => {
    copyToClipboard(sessionId)
    toastActions.add(t('copied to clipboard'), 2000)
  }, [sessionId, t])

  return !isSmallScreen ? (
    <Flex align="center" gap="md" className="controls">
      {!isSmallScreen ? (
        <Button
          h={28}
          px="xs"
          radius="lg"
          variant="outline"
          color="chatbox-tertiary"
          leftSection={<ScalableIcon icon={IconSearch} size={16} strokeWidth={1.8} />}
          className="border-chatbox-border-primary"
          classNames={{
            label: 'px-1',
          }}
          onClick={() => setOpenSearchDialog(true)}
        >
          {t('Search')}...
        </Button>
      ) : (
        <ActionIcon variant="subtle" size={28} color="chatbox-secondary" onClick={() => setOpenSearchDialog(true)}>
          <IconSearch strokeWidth={1.8} />
        </ActionIcon>
      )}

      <ActionMenu
        position="bottom-end"
        items={[
          ...(isLargeScreen
            ? [
                {
                  text: widthFull ? t('Standard Width') : t('Full Width'),
                  icon: widthFull ? LayoutExpand : LayoutShrink,
                  onClick: () => setWidthFull(!widthFull),
                },
              ]
            : []),
          {
            text: t('Thread History'),
            icon: IconHistory,
            onClick: () => setThreadHistoryDrawerOpen(true),
          },
          {
            divider: true,
          },
          {
            text: t('Duplicate Conversation'),
            icon: IconCopy,
            onClick: handleCopySession,
          },
          {
            text: t('Copy Conversation ID'),
            icon: IconId,
            onClick: handleCopySessionId,
          },
          {
            text: t('Export Chat'),
            icon: IconDeviceFloppy,
            onClick: handleExportAndSave,
          },
          ...(process.env.NODE_ENV === 'development'
            ? [
                {
                  text: t('View Session JSON'),
                  icon: IconCode,
                  onClick: handleViewSessionJson,
                },
              ]
            : []),
          {
            divider: true,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Clear All Messages'),
            icon: Broom,
            color: 'chatbox-primary',
            onClick: handleSessionClean,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Delete Current Session'),
            icon: IconTrash,
            color: 'chatbox-primary',
            onClick: handleSessionDelete,
          },
        ]}
      >
        <ActionIcon variant="subtle" size={28} color="chatbox-secondary">
          <IconDots strokeWidth={1.8} />
        </ActionIcon>
      </ActionMenu>
    </Flex>
  ) : (
    <Flex align="center" gap="xs">
      <ActionIcon variant="subtle" size={24} color="chatbox-secondary" onClick={() => setOpenSearchDialog(true)}>
        <IconSearch strokeWidth={1.8} />
      </ActionIcon>
      <ActionMenu
        position="bottom-end"
        items={[
          {
            text: t('Thread History'),
            icon: IconHistory,
            onClick: () => setThreadHistoryDrawerOpen(true),
          },
          {
            text: t('Duplicate Conversation'),
            icon: IconCopy,
            onClick: handleCopySession,
          },
          {
            text: t('Copy Conversation ID'),
            icon: IconId,
            onClick: handleCopySessionId,
          },
          {
            text: t('Export Chat'),
            icon: IconDeviceFloppy,
            onClick: handleExportAndSave,
          },
          ...(process.env.NODE_ENV === 'development'
            ? [
                {
                  text: t('View Session JSON'),
                  icon: IconCode,
                  onClick: handleViewSessionJson,
                },
              ]
            : []),
          {
            divider: true,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Clear All Messages'),
            icon: IconClearAll,
            color: 'chatbox-primary',
            onClick: handleSessionClean,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Delete Current Session'),
            icon: IconTrash,
            color: 'chatbox-primary',
            onClick: handleSessionDelete,
          },
        ]}
      >
        <ActionIcon variant="subtle" size={24} color="chatbox-secondary">
          <IconDots strokeWidth={1.8} />
        </ActionIcon>
      </ActionMenu>
    </Flex>
  )
}
