import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, type ActionIconProps, Button, Flex, Loader, Modal, Stack, Text } from '@mantine/core'
import { Box, Grid, useTheme } from '@mui/material'
import { TestId } from '@shared/automation/testids'
import { findMessageLocation } from '@shared/session/message-forks'
import type {
  Message,
  MessageBackgroundTask,
  MessageReasoningPart,
  MessageTextPart,
  MessageToolCallPart,
  SessionType,
} from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import {
  IconArrowDown,
  IconChevronDown,
  IconClockHour3,
  IconCode,
  IconCopy,
  IconDotsVertical,
  IconInfoCircle,
  IconMessageReport,
  IconPencil,
  IconPhotoPlus,
  IconPlayerStopFilled,
  type IconProps,
  IconQuoteFilled,
  IconReload,
  IconRobot,
  IconTrash,
} from '@tabler/icons-react'
import clsx from 'clsx'
import * as dateFns from 'date-fns'
import type React from 'react'
import {
  type FC,
  Fragment,
  forwardRef,
  type MouseEventHandler,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { trackAgentModeSuggestionAction } from '@/analytics/agent-mode'
import { trackJkClickEvent } from '@/analytics/jk'
import { JK_EVENTS, JK_PAGE_NAMES } from '@/analytics/jk-events'
import Markdown from '@/components/Markdown'
import StreamingTextFade from '@/components/StreamingTextFade'
import { AppTooltip as Tooltip1 } from '@/components/ui/tooltip'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { formatElapsedTime } from '@/hooks/useThinkingTimer'
import { cn } from '@/lib/utils'
import { navigateToSettings } from '@/modals/Settings'
import { copyToClipboard } from '@/packages/navigator'
import { countWord } from '@/packages/word-count'
import { getSession } from '@/stores/chatStore'
import { lockSessionAgentMode, setSessionAgentMode } from '@/stores/session/agent-mode'
import { isCancellableGeneratingAssistantMessage } from '@/stores/session/generation-state'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import '../../static/Block.css'
import {
  generate,
  generateMore,
  isRetryableToolCallStep,
  modifyMessage,
  regenerateInNewFork,
  removeMessage,
  retryFromLastToolCallAfterApiError,
  stopGeneratingMessages,
} from '@/stores/sessionActions'
import * as toastActions from '@/stores/toastActions'
import ActionMenu, { type ActionMenuItemProps } from '../ActionMenu'
import { AssistantAvatar, SystemAvatar, UserAvatar } from '../common/Avatar'
import { ScalableIcon } from '../common/ScalableIcon'
import Loading from '../icons/Loading'
import {
  DownloadArtifactsUI,
  ReasoningContentUI,
  StepTimelineUI,
  ToolCallPartUI,
} from '../message-parts/ToolCallPartUI'
import { MessageAttachmentGrid } from './MessageAttachmentGrid'
import MessageErrTips from './MessageErrTips'
import MessageStatuses, { PreparingToolCallStatus } from './MessageLoading'
import {
  getMessageActionVisibilityClass,
  type MessageButtonGroup,
  shouldShowConcurrentReplyStop,
} from './message-action-state'
import { isMessageReminderPresentation, resolveMessageErrorPresentation } from './message-error-presentation'
import { shouldRightAlignMessage } from './message-layout'
import { getMessageRoleClass } from './message-role-class'
import { createMessageTimelineLayout } from './message-timeline'
import { getMessageTokenDisplay } from './message-token-display'
import { PictureGallery } from './PictureGallery'

// Reset an assistant message back to a clean generating state, reusing the same
// message slot (e.g. when acting on an agent-mode suggestion callout).
function resetMessageForAgentModeResponse(msg: Message): Message {
  return {
    ...msg,
    generating: true,
    cancel: undefined,
    contentParts: [],
    errorCode: undefined,
    error: undefined,
    errorExtra: undefined,
    status: [],
    finishReason: undefined,
  }
}

interface Props {
  id?: string
  sessionId: string
  sessionType: SessionType
  msg: Message
  className?: string
  collapseThreshold?: number // 文本长度阀值, 超过这个长度则会被折叠
  buttonGroup?: MessageButtonGroup // 按钮组显示策略, auto: 只在 hover 时显示; always: 总是显示; none: 不显示
  generatingReplyCount?: number
  generationLocked?: boolean
  readOnly?: boolean
  allowGeneratingStop?: boolean
  small?: boolean
  assistantAvatarKey?: string
  sessionPicUrl?: string
}

const BackgroundTaskNotificationUI: FC<{ task: MessageBackgroundTask; className?: string }> = ({ task, className }) => {
  const { t } = useTranslation()
  const failed = task.status === 'failed'
  return (
    <Box className={cn('w-full px-2 py-1.5', className)} role="status">
      <Flex justify="center">
        <Flex
          align="center"
          gap={6}
          px="sm"
          py={5}
          className="max-w-full rounded-full bg-chatbox-background-gray-secondary"
        >
          <ScalableIcon
            icon={failed ? IconInfoCircle : IconPhotoPlus}
            size={14}
            className={failed ? 'text-chatbox-tint-error' : 'text-chatbox-tint-success'}
          />
          <Text size="xs" c={failed ? 'chatbox-error' : 'chatbox-secondary'} fw={500} truncate="end">
            {failed ? t('Image generation failed') : t('Image generated')}
          </Text>
          <Text size="xs" c="chatbox-tertiary" className="shrink-0 tabular-nums">
            · {t('Waited {{time}}', { time: formatElapsedTime(task.elapsedMs) })}
          </Text>
        </Flex>
      </Flex>
    </Box>
  )
}

const _Message: FC<Props> = (props) => {
  const {
    sessionId,
    msg,
    className,
    collapseThreshold,
    buttonGroup = 'auto',
    generatingReplyCount = 0,
    generationLocked = false,
    readOnly = false,
    allowGeneratingStop = false,
    small,
    assistantAvatarKey,
    sessionPicUrl,
  } = props

  const { t } = useTranslation()
  const theme = useTheme()
  const isSmallScreen = useIsSmallScreen()
  const userAvatarKey = useSettingsStore((state) => state.userAvatarKey)
  const showMessageTimestamp = useSettingsStore((state) => state.showMessageTimestamp)
  const showModelName = useSettingsStore((state) => state.showModelName)
  const showWordCount = useSettingsStore((state) => state.showWordCount)
  const showTokenUsed = useSettingsStore((state) => state.showTokenUsed)
  const showFirstTokenLatency = useSettingsStore((state) => state.showFirstTokenLatency)
  const enableMarkdownRendering = useSettingsStore((state) => state.enableMarkdownRendering)
  const enableLaTeXRendering = useSettingsStore((state) => state.enableLaTeXRendering)
  const enableMermaidRendering = useSettingsStore((state) => state.enableMermaidRendering)
  const showAvatar = useSettingsStore((state) => state.showAvatar)
  const messageLayout = useSettingsStore((state) => state.messageLayout)

  const isBubbleLayout = messageLayout === 'bubble'

  const [retryChoiceOpened, setRetryChoiceOpened] = useState(false)

  const contentLength = useMemo(() => {
    return getMessageText(msg).length
  }, [msg])

  const needCollapse =
    collapseThreshold &&
    props.sessionType !== 'picture' && // 绘图会话不折叠
    contentLength > collapseThreshold &&
    contentLength - collapseThreshold > 50 // 只有折叠有明显效果才折叠，为了更好的用户体验
  const [isCollapsed, setIsCollapsed] = useState(needCollapse)

  const ref = useRef<HTMLDivElement>(null)

  const setQuote = useUIStore((state) => state.setQuote)

  const quoteMsg = useCallback(() => {
    let input = getMessageText(msg)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    input += '\n\n-------------------\n\n'
    setQuote(input)
  }, [msg, setQuote])

  const handleStop = useCallback(async () => {
    if (msg.generating) {
      await stopGeneratingMessages(sessionId, [msg], {
        removeMessage,
        persistMessage: (currentSessionId, message) => modifyMessage(currentSessionId, message, true),
      })
      return
    }
    await modifyMessage(sessionId, { ...msg, generating: false, cancel: undefined }, true)
  }, [sessionId, msg])

  const notifyGenerationLocked = useCallback(() => {
    toastActions.add(t('Wait for the current replies to finish'), 2500)
  }, [t])

  const handleRefresh = useCallback(async () => {
    if (generationLocked) {
      notifyGenerationLocked()
      return
    }
    await handleStop()
    await regenerateInNewFork(sessionId, msg)
  }, [generationLocked, handleStop, msg, notifyGenerationLocked, sessionId])

  // Tracking is best-effort and must never block or break the accept/decline
  // action, so this fetches the session on its own and swallows failures.
  const trackAgentModeSuggestionActionAsync = useCallback(
    (action: 'accept' | 'decline') => {
      void getSession(sessionId)
        .then((session) => {
          let fileCount = 0
          const location = session ? findMessageLocation(session, msg.id) : null
          if (location) {
            for (let index = location.index - 1; index >= 0; index -= 1) {
              const message = location.list[index]
              if (message.role === 'user') {
                fileCount = message.files?.length ?? 0
                break
              }
            }
          }
          trackAgentModeSuggestionAction({
            action,
            hasFiles: fileCount > 0,
            fileCount,
            context: {
              sessionId,
              mode: action === 'accept' ? 'work_mode' : 'chat_mode',
              provider: session?.settings?.provider,
              model: session?.settings?.modelId,
            },
          })
        })
        .catch(() => {})
    },
    [msg.id, sessionId]
  )

  const agentModeSuggestionHandledRef = useRef(false)

  const handleStartAgentModeResponse = useCallback(async () => {
    if (agentModeSuggestionHandledRef.current) return
    agentModeSuggestionHandledRef.current = true
    trackAgentModeSuggestionActionAsync('accept')
    try {
      await lockSessionAgentMode(sessionId, 'message_sent')
      const nextMsg = resetMessageForAgentModeResponse(msg)
      await modifyMessage(sessionId, nextMsg, true)
      await generate(sessionId, nextMsg, { operationType: 'send_message', agentModeEntrySource: 'suggestion_accept' })
    } catch (error) {
      agentModeSuggestionHandledRef.current = false
      throw error
    }
  }, [trackAgentModeSuggestionActionAsync, msg, sessionId])

  const handleContinueNormalResponse = useCallback(async () => {
    if (agentModeSuggestionHandledRef.current) return
    agentModeSuggestionHandledRef.current = true
    trackAgentModeSuggestionActionAsync('decline')
    try {
      await setSessionAgentMode(sessionId, 'off')
      const nextMsg = resetMessageForAgentModeResponse(msg)
      await modifyMessage(sessionId, nextMsg, true)
      await generate(sessionId, nextMsg, { operationType: 'send_message', skipAgentModeSuggestion: true })
    } catch (error) {
      agentModeSuggestionHandledRef.current = false
      throw error
    }
  }, [trackAgentModeSuggestionActionAsync, msg, sessionId])

  const lastStepForRetry = useMemo(() => {
    for (let index = msg.contentParts.length - 1; index >= 0; index -= 1) {
      const part = msg.contentParts[index]
      if (part.type === 'tool-call') {
        const toolCallPart = part as MessageToolCallPart
        if (isRetryableToolCallStep(toolCallPart)) {
          return toolCallPart
        }
      }
    }
    return undefined
  }, [msg.contentParts])

  const handleRetryWholeMessage = useCallback(async () => {
    setRetryChoiceOpened(false)
    await handleRefresh()
  }, [handleRefresh])

  const handleRetryLastStep = useCallback(async () => {
    if (!lastStepForRetry) return
    if (generationLocked) {
      notifyGenerationLocked()
      return
    }
    setRetryChoiceOpened(false)
    await retryFromLastToolCallAfterApiError(sessionId, msg.id, lastStepForRetry.toolCallId)
  }, [generationLocked, lastStepForRetry, msg.id, notifyGenerationLocked, sessionId])

  const handleErrorTipRetry = useCallback(async () => {
    if (lastStepForRetry) {
      if (generationLocked) {
        notifyGenerationLocked()
        return
      }
      await retryFromLastToolCallAfterApiError(sessionId, msg.id, lastStepForRetry.toolCallId)
      return
    }
    await handleRefresh()
  }, [generationLocked, handleRefresh, lastStepForRetry, msg.id, notifyGenerationLocked, sessionId])

  const handleMessageRetry = useCallback(async () => {
    if (lastStepForRetry) {
      setRetryChoiceOpened(true)
      return
    }
    await handleRefresh()
  }, [handleRefresh, lastStepForRetry])

  const onGenerateMore = useCallback(() => {
    generateMore(sessionId, msg.id)
  }, [sessionId, msg.id])

  const onCopyMsg = useCallback(() => {
    copyToClipboard(getMessageText(msg, true, false))
    toastActions.add(t('copied to clipboard'), 2000)
  }, [msg, t])

  // 复制特定 reasoning 内容
  const onCopyReasoningContent =
    (content: string): MouseEventHandler<HTMLButtonElement> =>
    (e) => {
      e.stopPropagation()
      if (content) {
        copyToClipboard(content)
        toastActions.add(t('copied to clipboard'))
      }
    }

  const onReport = useCallback(async () => {
    await NiceModal.show('report-content', { contentId: getMessageText(msg) || msg.id })
  }, [msg])

  const onDelMsg = useCallback(async () => {
    // Deleting a still-streaming reply must stop it first: the stream writes by
    // message id and would keep running invisibly after the message is gone.
    if (msg.generating) {
      await handleStop()
    }
    await removeMessage(sessionId, msg.id)
  }, [handleStop, msg, sessionId])

  const onEditClick = useCallback(async () => {
    // The UI hides the edit entry for a streaming message, but guard anyway:
    // saving a snapshot of it would be silently overwritten by the next chunk.
    if (msg.generating) {
      notifyGenerationLocked()
      return
    }
    // Plain saves are safe while replies stream (writes are serialized and the
    // in-flight context was snapshotted at generation start), but Save & Resend
    // is a regenerate-class action and stays locked like Retry.
    await NiceModal.show('message-edit', { sessionId, msg, hideSaveAndResend: generationLocked })
  }, [generationLocked, msg, notifyGenerationLocked, sessionId])

  const onViewMessageJson = useCallback(async () => {
    await NiceModal.show('json-viewer', { title: t('Message Raw JSON'), data: msg })
  }, [msg, t])

  // Units like "tokens", "words", "tkn", "s" are intentionally kept as hardcoded English
  // because they are technical/universal abbreviations that remain readable across all locales.
  const tips: { label: string; tooltip?: string }[] = []
  if (props.sessionType === 'chat' || !props.sessionType) {
    if (showModelName && props.msg.role === 'assistant') {
      tips.push({ label: props.msg.model || 'unknown', tooltip: t('Model') as string })
    }
    if (showTokenUsed && msg.role === 'assistant' && !msg.generating) {
      const consumedTokens = getMessageTokenDisplay(msg)
      if (consumedTokens) {
        tips.push({
          label: `${consumedTokens} tokens`,
          tooltip: t('Total tokens consumed') as string,
        })
      }
    }
    if (showWordCount && !msg.generating) {
      const wc = msg.wordCount !== undefined ? msg.wordCount : countWord(getMessageText(msg))
      tips.push({ label: `${wc} words`, tooltip: t('Word count') as string })
    }
    if (showFirstTokenLatency && msg.role === 'assistant' && !msg.generating) {
      if (msg.firstTokenLatency)
        tips.push({
          label: `${(msg.firstTokenLatency / 1000).toFixed(1)}s`,
          tooltip: t('First token latency') as string,
        })
    }
  } else if (props.sessionType === 'picture') {
    if (showModelName && props.msg.role === 'assistant') {
      tips.push({ label: props.msg.model || 'unknown', tooltip: t('Model') as string })
      if (props.msg.style) tips.push({ label: props.msg.style })
    }
  }

  if (msg.finishReason && ['content-filter', 'length', 'error'].includes(msg.finishReason)) {
    tips.push({ label: msg.finishReason })
  }

  if (showMessageTimestamp && msg.timestamp !== undefined) {
    const date = new Date(msg.timestamp)
    let messageTimestamp: string
    if (dateFns.isToday(date)) {
      messageTimestamp = dateFns.format(date, 'HH:mm')
    } else if (dateFns.isThisYear(date)) {
      messageTimestamp = dateFns.format(date, 'MM-dd HH:mm')
    } else {
      messageTimestamp = dateFns.format(date, 'yyyy-MM-dd HH:mm')
    }
    tips.push({ label: messageTimestamp })
  }

  const trackWithSessionName = useCallback(
    async (event: string) => {
      const session = await getSession(sessionId).catch(() => null)
      trackJkClickEvent(event, {
        pageName: JK_PAGE_NAMES.CHAT_PAGE,
        content: session?.name,
      })
    },
    [sessionId]
  )
  const onCodeCopy = useCallback(() => {
    trackWithSessionName(JK_EVENTS.COPY_CODE_CLICK)
  }, [trackWithSessionName])
  const onPreviewWebpage = useCallback(() => {
    trackWithSessionName(JK_EVENTS.PREVIEW_WEBPAGE_CLICK)
  }, [trackWithSessionName])

  const contentParts = msg.contentParts || []
  const leadingStatuses = useMemo(
    () => msg.status?.filter((status) => status.type !== 'preparing_tool_call'),
    [msg.status]
  )
  const preparingToolCallStatuses = useMemo(
    () => msg.status?.filter((status) => status.type === 'preparing_tool_call'),
    [msg.status]
  )
  const downloadArtifactParts = useMemo(
    () =>
      contentParts.filter(
        (item): item is MessageToolCallPart =>
          item.type === 'tool-call' && (item as MessageToolCallPart).toolName === 'create_download'
      ),
    [contentParts]
  )

  // Normalize provider-specific non-streaming reasoning order before deciding
  // which text belongs to the process timeline and which text is the final answer.
  const { orderedContentParts, lastStepIndex, groupedContentParts } = useMemo(
    () => createMessageTimelineLayout(contentParts, msg.isStreamingMode),
    [contentParts, msg.isStreamingMode]
  )

  // Total time the assistant spent "working" on this message (thinking + tools).
  // Prefer the wall-clock generation time, but never report less than the sum of
  // the individual step durations (covers resumed/appended runs).
  const workDurationMs = useMemo(() => {
    let sum = 0
    for (const part of contentParts) {
      if ((part.type === 'reasoning' || part.type === 'tool-call') && part.duration) {
        sum += part.duration
      }
    }
    return Math.max(msg.generationDuration ?? 0, sum)
  }, [contentParts, msg.generationDuration])

  const workStepCount = useMemo(
    () => contentParts.filter((p) => p.type === 'reasoning' || p.type === 'tool-call').length,
    [contentParts]
  )

  // There is something to fold when a thinking/tool step exists before the last
  // content part (so collapsing hides the process and keeps the final answer).
  const hasFoldableProcess = useMemo(
    () =>
      contentParts.some((p, i) => (p.type === 'reasoning' || p.type === 'tool-call') && i < contentParts.length - 1),
    [contentParts]
  )

  // Offer the collapsible process summary on any finished assistant run that has
  // a multi-step process worth hiding. With a single step there is nothing to fold —
  // the step renders its own duration inline — so skip the collapse header entirely.
  const showWorkSummary = msg.role === 'assistant' && !msg.generating && hasFoldableProcess && workStepCount > 1
  const workSummaryLabel =
    workDurationMs >= 1000
      ? t('Worked for {{time}}', { time: formatElapsedTime(workDurationMs) })
      : t('{{count}} steps', { count: workStepCount })
  const [processCollapsed, setProcessCollapsed] = useState(false)

  // When collapsed, hide the process and show the final answer. The answer can
  // span multiple parts after the last step (e.g. text + image), so show the
  // whole answer region rather than only the last part.
  const displayGroups = useMemo<typeof groupedContentParts>(() => {
    if (!(showWorkSummary && processCollapsed)) return groupedContentParts
    const answerParts = orderedContentParts.slice(lastStepIndex + 1)
    if (answerParts.length > 0) return answerParts
    // The message ended on a process step — fall back to showing that last step.
    const lastPart = orderedContentParts[orderedContentParts.length - 1]
    if (!lastPart) return []
    if (lastPart.type === 'tool-call' || lastPart.type === 'reasoning') {
      return [{ type: 'step_group' as const, parts: [lastPart] }]
    }
    return [lastPart]
  }, [showWorkSummary, processCollapsed, groupedContentParts, orderedContentParts, lastStepIndex])

  // Renders an intermediate text block inside the step timeline, reusing the same
  // markdown settings as the main answer text.
  const renderTimelineText = useCallback(
    (part: MessageTextPart, index: number): React.ReactNode =>
      enableMarkdownRendering ? (
        <Markdown
          uniqueId={`${msg.id}-step-${index}`}
          sessionId={sessionId}
          enableLaTeXRendering={enableLaTeXRendering}
          enableMermaidRendering={enableMermaidRendering}
          generating={msg.generating}
          onCodeCopy={onCodeCopy}
          onPreviewWebpage={onPreviewWebpage}
        >
          {part.text || ''}
        </Markdown>
      ) : (
        <div className="break-words [overflow-wrap:anywhere] whitespace-pre-line">{part.text}</div>
      ),
    [
      enableMarkdownRendering,
      enableLaTeXRendering,
      enableMermaidRendering,
      msg.generating,
      msg.id,
      onCodeCopy,
      onPreviewWebpage,
      sessionId,
    ]
  )

  const CollapseButton = (
    <span
      className="cursor-pointer inline-block text-xs font-medium text-chatbox-tint-brand
                 hover:text-chatbox-tint-brand-hover px-1.5 py-0.5 rounded
                 hover:bg-chatbox-background-brand-secondary transition-colors"
      onClick={() => setIsCollapsed(!isCollapsed)}
    >
      {isCollapsed ? t('Expand') : t('Collapse')}
    </span>
  )

  const onClickAssistantAvatar = async () => {
    await NiceModal.show('session-settings', {
      session: await getSession(props.sessionId),
    })
  }

  const actionMenuItems = useMemo<ActionMenuItemProps[]>(
    () => [
      ...(isSmallScreen
        ? [
            !msg.generating &&
              msg.role === 'assistant' && {
                text: t('Reply Again'),
                icon: IconReload,
                testId: TestId.message.actionMenuRetry,
                onClick: handleRefresh,
                disabled: generationLocked && !isSmallScreen,
              },
            msg.role !== 'assistant' && {
              text: t('Reply Again Below'),
              icon: IconArrowDown,
              testId: TestId.message.actionMenuRetryBelow,
              onClick: onGenerateMore,
            },
            !msg.model?.startsWith('Chatbox-AI') &&
              !(msg.role === 'assistant' && props.sessionType === 'picture') && {
                text: t('Edit'),
                icon: IconPencil,
                testId: TestId.message.actionMenuEdit,
                onClick: onEditClick,
              },
            !(props.sessionType === 'picture' && msg.role === 'assistant') && {
              text: t('copy'),
              icon: IconCopy,
              testId: TestId.message.actionMenuCopy,
              onClick: onCopyMsg,
            },
            !msg.generating &&
              props.sessionType === 'picture' &&
              msg.role === 'assistant' && {
                text: t('Generate More Images Below'),
                icon: IconPhotoPlus,
                onClick: onGenerateMore,
              },
          ].filter((i) => !!i)
        : []),
      {
        text: t('Quote'),
        icon: IconQuoteFilled,
        testId: TestId.message.actionQuote,
        onClick: quoteMsg,
      },
      { divider: true },
      ...(msg.role === 'assistant'
        ? [
            {
              text: t('report'),
              icon: IconMessageReport,
              onClick: onReport,
            },
          ]
        : []),
      ...(process.env.NODE_ENV === 'development'
        ? [
            {
              text: t('View Message JSON'),
              icon: IconCode,
              onClick: onViewMessageJson,
            },
          ]
        : []),
      {
        doubleCheck: true,
        text: t('delete'),
        icon: IconTrash,
        testId: TestId.message.actionDelete,
        confirmTestId: TestId.message.actionDeleteConfirm,
        confirmPanelTestId: TestId.message.deleteConfirmation,
        onClick: onDelMsg,
      },
    ],
    [
      t,
      msg.role,
      onReport,
      quoteMsg,
      onDelMsg,
      onViewMessageJson,
      isSmallScreen,
      handleRefresh,
      msg.generating,
      onGenerateMore,
      onEditClick,
      onCopyMsg,
      msg.model,
      props.sessionType,
      generationLocked,
    ]
  )
  const [actionMenuOpened, setActionMenuOpened] = useState(false)

  const isUserBubble = isBubbleLayout && msg.role === 'user'
  const isErrorReminder = msg.error ? isMessageReminderPresentation(resolveMessageErrorPresentation(msg)) : false
  const isClassicLayout = !isBubbleLayout
  const isClassicMessage = isClassicLayout && (msg.role === 'assistant' || msg.role === 'user')
  const isRightAlignedMessage = shouldRightAlignMessage(messageLayout, msg.role)
  const messageRoleClass = getMessageRoleClass(msg.role)
  const shouldShowAvatar = showAvatar ?? true
  const statusElements = <MessageStatuses statuses={leadingStatuses} />
  const errorTipsElement = (
    <MessageErrTips
      msg={msg}
      sessionId={sessionId}
      onRetry={!readOnly && msg.role === 'assistant' ? handleErrorTipRetry : undefined}
      isBubbleLayout={isBubbleLayout}
    />
  )

  const messageContent = (
    <>
      <div
        data-testid={TestId.message.content}
        className={cn(
          isBubbleLayout
            ? 'inline-block max-w-full min-w-0'
            : msg.role === 'assistant'
              ? 'w-full min-w-0'
              : 'inline-block max-w-full min-w-0',
          isBubbleLayout
            ? cn(
                'px-4 py-1 rounded-lg',
                msg.role === 'user'
                  ? 'bg-[var(--mantine-color-chatbox-brand-filled)] text-white'
                  : msg.role === 'assistant'
                    ? msg.error
                      ? isErrorReminder
                        ? '!p-0 !bg-transparent'
                        : 'bg-chatbox-background-error-secondary border border-solid border-chatbox-border-error'
                      : 'bg-chatbox-background-secondary'
                    : 'bg-chatbox-background-secondary rounded-lg'
              )
            : msg.role !== 'assistant'
              ? 'bg-chatbox-background-secondary px-4 rounded-lg'
              : ''
        )}
      >
        <Box
          className={cn('msg-content', { 'msg-content-small': small })}
          sx={small ? { fontSize: theme.typography.body2.fontSize } : {}}
        >
          {showWorkSummary && (
            <Flex
              align="center"
              gap={4}
              className="cursor-pointer w-fit mb-1 select-none opacity-80 hover:opacity-100 transition-opacity"
              onClick={() => setProcessCollapsed((v) => !v)}
            >
              <ScalableIcon icon={IconClockHour3} size={13} className="flex-none text-chatbox-tint-tertiary" />
              <Text size="xs" c="chatbox-tertiary">
                {workSummaryLabel}
              </Text>
              <ScalableIcon
                icon={IconChevronDown}
                size={13}
                className={cn(
                  'flex-none text-chatbox-tint-tertiary transition-transform',
                  processCollapsed ? '' : 'rotate-180'
                )}
              />
            </Flex>
          )}
          {msg.reasoningContent && !(showWorkSummary && processCollapsed) && (
            <ReasoningContentUI message={msg} onCopyReasoningContent={onCopyReasoningContent} />
          )}
          {getMessageText(msg, true, true).trim() === '' && <p></p>}
          {displayGroups.length > 0 && (
            <div>
              {displayGroups.map((item, index) =>
                item.type === 'reasoning' ? (
                  <div key={`reasoning-${msg.id}-${index}`}>
                    <ReasoningContentUI message={msg} part={item} onCopyReasoningContent={onCopyReasoningContent} />
                  </div>
                ) : item.type === 'text' ? (
                  <div key={`text-${msg.id}-${index}`}>
                    {enableMarkdownRendering && !isCollapsed ? (
                      <Markdown
                        uniqueId={`${msg.id}-${index}`}
                        sessionId={sessionId}
                        enableLaTeXRendering={enableLaTeXRendering}
                        enableMermaidRendering={enableMermaidRendering}
                        generating={msg.generating}
                        onCodeCopy={onCodeCopy}
                        onPreviewWebpage={onPreviewWebpage}
                      >
                        {item.text || ''}
                      </Markdown>
                    ) : (
                      <StreamingTextFade
                        text={needCollapse && isCollapsed ? `${item.text.slice(0, collapseThreshold)}...` : item.text}
                        streamKey={`${msg.id}-${index}`}
                        generating={msg.role === 'assistant' && msg.generating === true}
                        className="break-words [overflow-wrap:anywhere] whitespace-pre-line"
                      >
                        {needCollapse && isCollapsed && CollapseButton}
                      </StreamingTextFade>
                    )}
                  </div>
                ) : item.type === 'info' ? (
                  <Flex key={`info-${item.text}`} className="mb-2 ">
                    <Flex
                      className="bg-chatbox-background-brand-secondary border-0 border-l-2 border-solid border-chatbox-tint-brand rounded-r-md"
                      align="center"
                      gap="xxs"
                      px="xs"
                    >
                      <ScalableIcon icon={IconInfoCircle} size={16} className="flex-none text-chatbox-tint-brand" />
                      <Text size="xs" c="chatbox-brand">
                        {item.text}
                      </Text>
                    </Flex>
                  </Flex>
                ) : item.type === 'agent-mode-suggestion' ? (
                  <Flex key={`agent-mode-suggestion-${msg.id}-${index}`} className="mb-2 w-full">
                    <Flex
                      className="w-full max-w-[760px] bg-chatbox-background-secondary border border-solid border-chatbox-border-primary rounded-lg shadow-sm overflow-hidden"
                      align="stretch"
                    >
                      <div className="w-1 bg-chatbox-tint-brand" />
                      <Flex
                        align="center"
                        gap="sm"
                        px="sm"
                        py="sm"
                        className="min-w-0 flex-1"
                        wrap={{ base: 'wrap', sm: 'nowrap' }}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chatbox-background-brand-secondary text-chatbox-tint-brand">
                          <ScalableIcon icon={IconRobot} size={18} />
                        </div>
                        <Stack gap={2} className="min-w-0 flex-1">
                          <Text size="sm" fw={600} c="chatbox-primary">
                            {t('Work Mode suggested')}
                          </Text>
                          {item.reason && (
                            <Text size="xs" c="chatbox-secondary" className="break-words [overflow-wrap:anywhere]">
                              {item.reason}
                            </Text>
                          )}
                        </Stack>
                        <Flex gap="xs" className="shrink-0" wrap="nowrap">
                          <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            className="shrink-0"
                            onClick={handleContinueNormalResponse}
                          >
                            {t('Continue in Chat Mode')}
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color="chatbox-brand"
                            className="shrink-0"
                            leftSection={<IconRobot size={14} />}
                            onClick={handleStartAgentModeResponse}
                          >
                            {t('Use Work Mode')}
                          </Button>
                        </Flex>
                      </Flex>
                    </Flex>
                  </Flex>
                ) : item.type === 'image' ? (
                  props.sessionType !== 'picture' && (
                    <div key={`image-${item.storageKey}`} className="my-2">
                      <PictureGallery
                        key={`image-${item.storageKey}`}
                        pictures={[item]}
                        compact={msg.role === 'user'}
                      />
                      {item.ocrResult && (
                        <div
                          className="my-2 p-2 rounded-lg cursor-pointer transition-colors"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await NiceModal.show('content-viewer', {
                              title: t('OCR Text Content'),
                              content: item.ocrResult,
                            })
                          }}
                        >
                          {isUserBubble ? (
                            <>
                              <span className="block mb-1 text-xs text-white/80">
                                {t('OCR Text')} ({item.ocrResult.length} {t('characters')})
                              </span>
                              <span className="block text-sm text-white line-clamp-2" title={item.ocrResult}>
                                {item.ocrResult}
                              </span>
                              <span className="block mt-1 text-xs text-white/60">{t('Click to view full text')}</span>
                            </>
                          ) : (
                            <>
                              <Text size="xs" className="block mb-1" c="chatbox-tertiary">
                                {t('OCR Text')} ({item.ocrResult.length} {t('characters')})
                              </Text>
                              <Text size="sm" className="line-clamp-2" c="chatbox-secondary" title={item.ocrResult}>
                                {item.ocrResult}
                              </Text>
                              <Text size="xs" className="mt-1 inline-block" c="blue">
                                {t('Click to view full text')}
                              </Text>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : 'parts' in item && item.type === 'step_group' ? (
                  item.parts.some((p) => p.type !== 'reasoning') ? (
                    <StepTimelineUI
                      key={`step-group-${msg.id}-${index}`}
                      parts={item.parts}
                      message={msg}
                      sessionId={sessionId}
                      messageId={msg.id}
                      onCopyReasoningContent={onCopyReasoningContent}
                      renderText={renderTimelineText}
                    />
                  ) : (
                    <Fragment key={`reasoning-group-${msg.id}-${index}`}>
                      {item.parts.map((p, pIdx) => (
                        <ReasoningContentUI
                          key={`reasoning-${msg.id}-${index}-${pIdx}`}
                          message={msg}
                          part={p as MessageReasoningPart}
                          onCopyReasoningContent={onCopyReasoningContent}
                        />
                      ))}
                    </Fragment>
                  )
                ) : item.type === 'tool-call' ? (
                  <ToolCallPartUI
                    key={item.toolCallId}
                    part={item as MessageToolCallPart}
                    sessionId={sessionId}
                    messageId={msg.id}
                  />
                ) : null
              )}
            </div>
          )}
          {!msg.generating && (
            <DownloadArtifactsUI parts={downloadArtifactParts} sessionId={sessionId} messageId={msg.id} />
          )}
          {preparingToolCallStatuses?.map((status) => (
            <PreparingToolCallStatus key={`preparing-tool-call-${status.toolName ?? 'tool-call'}`} status={status} />
          ))}
        </Box>
        {props.sessionType === 'picture' && contentParts.filter((p) => p.type === 'image').length > 0 && (
          <PictureGallery pictures={contentParts.filter((p) => p.type === 'image')} onReport={onReport} />
        )}
        {isBubbleLayout && errorTipsElement}
        <Modal
          opened={retryChoiceOpened}
          onClose={() => setRetryChoiceOpened(false)}
          title={t('Retry failed response')}
          centered
        >
          <Stack gap="sm">
            <Text size="sm" c="chatbox-secondary">
              {t('The response failed after the last step. What would you like to retry?')}
            </Text>
            <Button color="chatbox-brand" onClick={handleRetryLastStep}>
              {t('Retry from last step')}
            </Button>
            <Button variant="light" color="chatbox-brand" onClick={handleRetryWholeMessage}>
              {t('Retry whole message')}
            </Button>
          </Stack>
        </Modal>
        {needCollapse && !isCollapsed && CollapseButton}
        {msg.generating && contentParts.length === 0 && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 py-3',
              isBubbleLayout ? 'px-1 rounded-lg bg-chatbox-background-secondary' : 'px-4'
            )}
          >
            <Loading />
          </div>
        )}
        {!isBubbleLayout && msg.error && <div className="mt-2">{errorTipsElement}</div>}
        {leadingStatuses && leadingStatuses.length > 0 && <div className="mt-2">{statusElements}</div>}
      </div>
    </>
  )

  const tipsElements =
    !msg.generating &&
    tips.length > 0 &&
    tips.map((tip, i) => {
      const text = (
        <Text key={i} size="11px" c="chatbox-tertiary" ff="monospace" lh={1.4} className="whitespace-nowrap">
          {i > 0 ? `· ${tip.label}` : tip.label}
        </Text>
      )
      return tip.tooltip ? (
        <Tooltip1 key={i} label={tip.tooltip} withArrow>
          {text}
        </Tooltip1>
      ) : (
        text
      )
    })

  const showConcurrentReplyStop = shouldShowConcurrentReplyStop({
    allowStop: allowGeneratingStop,
    cancellable: isCancellableGeneratingAssistantMessage(msg),
    generatingReplyCount,
    sessionType: props.sessionType,
  })
  const generatingActions = showConcurrentReplyStop && (
    <Flex gap={0} m="4px -4px -4px -4px" align="center" className={isSmallScreen ? 'sticky bottom-4' : ''}>
      <Flex
        gap={0}
        className={
          isSmallScreen
            ? 'p-xxs bg-chatbox-background-primary rounded-lg border-[0.5px] border-solid border-chatbox-border-primary shadow-sm'
            : ''
        }
      >
        <MessageActionIcon icon={IconPlayerStopFilled} tooltip={t('Stop generating this reply')} onClick={handleStop} />
      </Flex>
    </Flex>
  )

  const actionButtons = !readOnly && buttonGroup !== 'none' && !msg.generating && (
    <Flex
      gap={0}
      m="4px -4px -4px -4px"
      className={clsx(
        'transition-opacity',
        getMessageActionVisibilityClass(actionMenuOpened || buttonGroup === 'always'),
        isSmallScreen ? 'sticky bottom-4' : ''
      )}
      align="center"
    >
      <Flex
        data-testid={TestId.message.actionBar}
        gap={0}
        className={
          isSmallScreen
            ? 'p-xxs bg-chatbox-background-primary rounded-lg border-[0.5px] border-solid border-chatbox-border-primary shadow-sm'
            : ''
        }
      >
        {!msg.generating && msg.role === 'assistant' && (
          <MessageActionIcon
            testId={TestId.message.actionBarRetry}
            icon={IconReload}
            tooltip={generationLocked ? t('Wait for the current replies to finish') : t('Reply Again')}
            onClick={handleMessageRetry}
            disabled={generationLocked && !isSmallScreen}
          />
        )}
        {msg.role !== 'assistant' && (
          <MessageActionIcon
            testId={TestId.message.actionBarRetryBelow}
            icon={IconArrowDown}
            tooltip={t('Reply Again Below')}
            onClick={onGenerateMore}
          />
        )}
        {!msg.model?.startsWith('Chatbox-AI') && !(msg.role === 'assistant' && props.sessionType === 'picture') && (
          <MessageActionIcon
            testId={TestId.message.actionBarEdit}
            icon={IconPencil}
            tooltip={t('Edit')}
            onClick={onEditClick}
          />
        )}
        {!(props.sessionType === 'picture' && msg.role === 'assistant') && (
          <MessageActionIcon
            testId={TestId.message.actionBarCopy}
            icon={IconCopy}
            tooltip={t('Copy')}
            onClick={onCopyMsg}
          />
        )}
        {!msg.generating && props.sessionType === 'picture' && msg.role === 'assistant' && (
          <MessageActionIcon icon={IconPhotoPlus} tooltip={t('Generate More Images Below')} onClick={onGenerateMore} />
        )}
        <ActionMenu
          items={actionMenuItems}
          contentTestId={TestId.message.actionMenu}
          opened={actionMenuOpened}
          onChange={(opened) => setActionMenuOpened(opened)}
        >
          <MessageActionIcon testId={TestId.message.actionMore} icon={IconDotsVertical} tooltip={t('More')} />
        </ActionMenu>
      </Flex>
    </Flex>
  )

  const messageActions = (
    <>
      {actionButtons}
      {generatingActions}
    </>
  )

  const meta = (
    <Flex
      direction="column"
      gap={2}
      mt={isBubbleLayout ? 4 : 2}
      className={cn(isBubbleLayout ? 'px-1' : '')}
      align={isRightAlignedMessage ? 'flex-end' : 'flex-start'}
    >
      {tipsElements && (
        <Flex
          align="center"
          gap={4}
          wrap="wrap"
          justify={isRightAlignedMessage ? 'flex-end' : 'flex-start'}
          className="overflow-hidden"
        >
          {tipsElements}
        </Flex>
      )}
    </Flex>
  )

  if (msg.backgroundTask) {
    return <BackgroundTaskNotificationUI task={msg.backgroundTask} className={className} />
  }

  if (isBubbleLayout && msg.role === 'user') {
    return (
      <Box
        data-testid={TestId.message.item}
        data-message-role={msg.role}
        ref={ref}
        id={props.id}
        key={msg.id}
        className={cn(
          'group/message',
          'msg-block',
          'bubble-msg',
          'bubble-user-msg',
          'px-2 py-1.5',
          msg.generating ? 'rendering' : 'render-done',
          messageRoleClass,
          className,
          'w-full'
        )}
        sx={{
          paddingBottom: '0.1rem',
          paddingX: '1rem',
          [theme.breakpoints.down('sm')]: {
            paddingX: '0.3rem',
          },
        }}
      >
        <Flex justify="flex-end" gap="xs" className="w-full min-w-0">
          <Flex
            direction="column"
            align="flex-end"
            className={cn(
              'min-w-0',
              isSmallScreen ? (shouldShowAvatar ? 'max-w-[calc(100%-3rem)]' : 'max-w-[95%]') : 'max-w-[85%]'
            )}
          >
            {messageContent}
            {(msg.files || msg.links) && <MessageAttachmentGrid files={msg.files} links={msg.links} align="end" />}
            {meta}
            {actionButtons}
          </Flex>
          {shouldShowAvatar && (
            <Box className="mt-1 shrink-0">
              <UserAvatar avatarKey={userAvatarKey} onClick={() => navigateToSettings('/chat')} />
            </Box>
          )}
        </Flex>
      </Box>
    )
  }

  if (isClassicMessage) {
    return (
      <Box
        ref={ref}
        id={props.id}
        key={msg.id}
        className={cn(
          'group/message',
          'msg-block',
          'px-2 py-1.5',
          msg.generating ? 'rendering' : 'render-done',
          messageRoleClass,
          className,
          'w-full'
        )}
        sx={{
          paddingBottom: '0.1rem',
          paddingX: '1rem',
          [theme.breakpoints.down('sm')]: {
            paddingX: '0.3rem',
          },
        }}
      >
        <Flex gap="xs" align="flex-start" className="w-full min-w-0">
          {shouldShowAvatar && (
            <Box className={cn('relative shrink-0', msg.role !== 'assistant' ? 'mt-1' : 'mt-2')}>
              {msg.role === 'assistant' ? (
                <AssistantAvatar
                  avatarKey={assistantAvatarKey}
                  picUrl={sessionPicUrl}
                  sessionType={props.sessionType}
                  onClick={onClickAssistantAvatar}
                />
              ) : (
                <UserAvatar avatarKey={userAvatarKey} onClick={() => navigateToSettings('/chat')} />
              )}
              {msg.role === 'assistant' && msg.generating && (
                <Flex className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Loader size={32} className=" " classNames={{ root: "after:content-[''] after:border-[2px]" }} />
                </Flex>
              )}
            </Box>
          )}
          <Flex
            direction="column"
            align="flex-start"
            className={cn('min-w-0 flex-1 max-w-full', isSmallScreen && 'max-w-[95%]')}
          >
            {messageContent}
            {(msg.files || msg.links) && <MessageAttachmentGrid files={msg.files} links={msg.links} align="start" />}
            {meta}
            {messageActions}
          </Flex>
        </Flex>
      </Box>
    )
  }

  return (
    <Box
      data-testid={TestId.message.item}
      data-message-role={msg.role}
      ref={ref}
      id={props.id}
      key={msg.id}
      className={cn(
        'group/message',
        'msg-block',
        isBubbleLayout ? 'bubble-msg' : '',
        'px-2 py-1.5',
        msg.generating ? 'rendering' : 'render-done',
        messageRoleClass,
        className,
        'w-full'
      )}
      sx={{
        paddingBottom: '0.1rem',
        paddingX: '1rem',
        [theme.breakpoints.down('sm')]: {
          paddingX: '0.3rem',
        },
      }}
    >
      <Grid container wrap="nowrap" spacing={1.5}>
        {(showAvatar ?? true) && (
          <Grid item>
            <Box className={cn('relative', msg.role !== 'assistant' ? 'mt-1' : 'mt-2')}>
              {
                {
                  assistant: (
                    <AssistantAvatar
                      avatarKey={assistantAvatarKey}
                      picUrl={sessionPicUrl}
                      sessionType={props.sessionType}
                      onClick={onClickAssistantAvatar}
                    />
                  ),
                  user: !isBubbleLayout ? (
                    <UserAvatar avatarKey={userAvatarKey} onClick={() => navigateToSettings('/chat')} />
                  ) : null,
                  system: <SystemAvatar sessionType={props.sessionType} onClick={onClickAssistantAvatar} />,
                  tool: null,
                }[msg.role]
              }
              {msg.role === 'assistant' && msg.generating && (
                <Flex className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Loader size={32} className=" " classNames={{ root: "after:content-[''] after:border-[2px]" }} />
                </Flex>
              )}
            </Box>
          </Grid>
        )}
        <Grid item xs sm container sx={{ width: '0px', paddingRight: (showAvatar ?? true) ? '15px' : '0px' }}>
          <Grid item xs>
            {messageContent}
            {(msg.files || msg.links) && (
              <MessageAttachmentGrid files={msg.files} links={msg.links} align={isUserBubble ? 'end' : 'start'} />
            )}
            {meta}
            {messageActions}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  )
}

export default memo(_Message)

export const MessageActionIcon = forwardRef<
  HTMLButtonElement,
  ActionIconProps & {
    tooltip?: string | null
    testId?: string
    onClick?: MouseEventHandler<HTMLButtonElement>
    icon: React.ElementType<IconProps>
  }
>(({ tooltip, icon, testId, ...props }, ref) => {
  const isSmallScreen = useIsSmallScreen()
  const actionIcon = (
    <ActionIcon
      ref={ref}
      variant="subtle"
      w="auto"
      h="auto"
      miw="auto"
      mih="auto"
      p={4}
      bd={0}
      color="chatbox-secondary"
      aria-label={tooltip ?? undefined}
      data-testid={testId}
      {...props}
    >
      <ScalableIcon icon={icon} size={isSmallScreen ? 20 : 16} />
    </ActionIcon>
  )

  return tooltip ? (
    <Tooltip1 label={tooltip} openDelay={1000} withArrow>
      {actionIcon}
    </Tooltip1>
  ) : (
    actionIcon
  )
})
