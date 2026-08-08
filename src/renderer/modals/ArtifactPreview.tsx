import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { ActionIcon, Button, Flex, Stack, Text } from '@mantine/core'
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconExternalLink,
  IconReload,
  IconX,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Artifact } from '@/components/Artifact'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { Modal } from '@/components/layout/Overlay'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import platform from '@/platform'

export interface ArtifactPreviewProps {
  htmlCode: string
  previewUrl?: string
  sandboxPath?: string
  uniqueId?: string
  sessionId?: string
}

const ArtifactPreview = NiceModal.create((props: ArtifactPreviewProps) => {
  const { htmlCode, previewUrl, sandboxPath, uniqueId, sessionId } = props
  const modal = useModal()
  const { t } = useTranslation()
  const [reloadSign, setReloadSign] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const canOpenInBrowser = useMemo(() => !!previewUrl, [previewUrl])
  const onReload = () => {
    setReloadSign(Math.random())
  }
  const onClose = () => {
    modal.resolve()
    modal.hide()
  }
  const onOpenInBrowser = useCallback(async () => {
    if (!previewUrl) {
      return
    }
    await platform.openLink(previewUrl)
  }, [previewUrl])
  const isSmallScreen = useIsSmallScreen()
  const showFullscreen = isSmallScreen || isFullscreen
  const showLabeledActions = !isSmallScreen
  const mobileActionSize = 44

  return (
    <Modal
      opened={modal.visible}
      onClose={onClose}
      title={
        !isSmallScreen ? (
          <Flex align="center" py="xs" className="w-full">
            <Text fw={600} size="md">
              {t('Preview')}
            </Text>
          </Flex>
        ) : (
          t('Preview')
        )
      }
      withCloseButton={false}
      size="100%"
      classNames={{
        content: clsx('flex flex-col', showFullscreen ? '!h-[100vh] !max-h-[auto] !max-w-none' : 'max-w-5xl h-4/5'),
        header: clsx('flex-0 !pb-0', isSmallScreen && 'sr-only'),
        body: clsx('flex-1', showFullscreen ? '!p-0' : ''),
      }}
      fullScreen={showFullscreen}
      centered
      radius={0}
      transitionProps={{ transition: 'slide-up', duration: 200 }}
    >
      <Stack h="100%" gap={0}>
        {isSmallScreen && (
          <Flex
            component="header"
            align="center"
            justify="space-between"
            gap="sm"
            px="md"
            pt="calc(var(--mobile-safe-area-inset-top, 0px) + var(--mantine-spacing-xs))"
            pb="xs"
            tabIndex={-1}
            data-autofocus
            className="shrink-0 border-0 border-b border-solid border-[var(--chatbox-border-primary)] bg-[var(--chatbox-background-primary)] !outline-none"
          >
            <Text fw={600} size="md" className="shrink-0">
              {t('Preview')}
            </Text>
            <Flex align="center" gap="xs" className="shrink-0">
              <Flex
                align="center"
                gap={2}
                p={2}
                className="rounded-lg border border-solid border-[var(--chatbox-border-primary)] bg-[var(--chatbox-background-secondary)]"
              >
                <Tooltip label={t('Refresh')} withArrow openDelay={500}>
                  <ActionIcon
                    variant="transparent"
                    color="chatbox-tertiary"
                    size={mobileActionSize}
                    onClick={onReload}
                    aria-label={t('Refresh')}
                  >
                    <ScalableIcon icon={IconReload} size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip
                  label={canOpenInBrowser ? t('Open in Browser') : t('Open in Browser requires a preview URL')}
                  withArrow
                  openDelay={500}
                >
                  <ActionIcon
                    variant="transparent"
                    color="chatbox-tertiary"
                    size={mobileActionSize}
                    onClick={onOpenInBrowser}
                    aria-label={t('Open in Browser')}
                    disabled={!canOpenInBrowser}
                  >
                    <ScalableIcon icon={IconExternalLink} size={18} />
                  </ActionIcon>
                </Tooltip>
              </Flex>
              <Tooltip label={t('Close')} withArrow openDelay={500}>
                <ActionIcon
                  variant="subtle"
                  color="chatbox-tertiary"
                  size={mobileActionSize}
                  onClick={onClose}
                  aria-label={t('Close')}
                >
                  <ScalableIcon icon={IconX} size={20} />
                </ActionIcon>
              </Tooltip>
            </Flex>
          </Flex>
        )}
        <Artifact htmlCode={htmlCode} previewUrl={previewUrl} reloadSign={reloadSign} className="flex-1" />
        {showLabeledActions && (
          <Flex
            align="center"
            justify="flex-end"
            gap="xs"
            p="xs"
            className="shrink-0 flex-wrap border-0 border-t border-solid border-[var(--chatbox-border-primary)] bg-[var(--chatbox-background-primary)]"
          >
            <Button
              variant="subtle"
              size="xs"
              leftSection={<ScalableIcon icon={IconReload} size={16} />}
              onClick={onReload}
            >
              {t('Refresh')}
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<ScalableIcon icon={showFullscreen ? IconArrowsMinimize : IconArrowsMaximize} size={16} />}
              onClick={() => setIsFullscreen((value) => !value)}
            >
              {showFullscreen ? t('Exit fullscreen') : t('Fullscreen')}
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<ScalableIcon icon={IconExternalLink} size={16} />}
              onClick={onOpenInBrowser}
              disabled={!canOpenInBrowser}
            >
              {t('Open in Browser')}
            </Button>
            <Button variant="subtle" size="xs" leftSection={<ScalableIcon icon={IconX} size={16} />} onClick={onClose}>
              {t('Close')}
            </Button>
          </Flex>
        )}
      </Stack>
    </Modal>
  )
})

export default ArtifactPreview
