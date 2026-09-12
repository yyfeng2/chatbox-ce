import NiceModal from '@ebay/nice-modal-react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { ActionIcon, Box, Button, Flex, Loader, Menu, Stack, Text, Textarea, UnstyledButton } from '@mantine/core'
import { useViewportSize } from '@mantine/hooks'
import { TestId } from '@shared/automation/testids'
import {
  getFileAcceptConfig,
  getFileAcceptString,
  getUnsupportedFileType,
  isSupportedFile,
} from '@shared/file-extensions'
import { KNOWLEDGE_BASE_MAX_FILE_SIZE, KNOWLEDGE_BASE_MAX_FILE_SIZE_LABEL } from '@shared/knowledge-base'
import { listPendingApprovalToolCalls } from '@shared/message-approval'
import { isDeepSeekWeakToolUse } from '@shared/models/utils/deepseek'
import { getModel } from '@shared/providers'
import { formatNumber } from '@shared/utils'
import { resolveReasoningProviderOptions } from '@shared/utils/reasoning-control'
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconArrowBackUp,
  IconArrowUp,
  IconCamera,
  IconChevronRight,
  IconCirclePlus,
  IconFilePencil,
  IconFolder,
  IconPhoto,
  IconPlayerStopFilled,
  IconPlus,
  IconSettings,
  IconWand,
  IconWorldWww,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import { pick } from 'lodash'
import type React from 'react'
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import { createModelDependencies } from '@/adapters'
import { JK_PAGE_NAMES } from '@/analytics/jk-events'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import useInputBoxHistory from '@/hooks/useInputBoxHistory'
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase'
import { useProviders } from '@/hooks/useProviders'
import { useSaveBlob } from '@/hooks/useSaveBlob'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import {
  getContextMessageIds,
  isAutoCompactionEnabled,
  isCompactionInProgress,
  useContextTokens,
} from '@/packages/context-management'
import { trackingEvent } from '@/packages/event'
import {
  getModelContextWindowSync,
  getProviderModelContextWindowSync,
  useModelRegistryVersion,
} from '@/packages/model-registry'
import * as picUtils from '@/packages/pic_utils'
import { skillsController, subscribeSkillsChanged } from '@/packages/skills/controller'
import platform from '@/platform'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { notifyApprovalInputNudge } from '@/stores/approvalAttentionStore'
import * as atoms from '@/stores/atoms'
import { compactionUIStateMapAtom } from '@/stores/atoms/compactionAtoms'
import * as chatStore from '@/stores/chatStore'
import { useSession, useSessionSettings } from '@/stores/chatStore'
import { useSessionAgentMode } from '@/stores/session/agent-mode'
import { settingsStore, useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { trackEvent } from '@/utils/track'
import type {
  KnowledgeBase,
  Message,
  ProviderModelInfo,
  SessionAttachment,
  SessionAttachmentIndexingStage,
  SessionSettings,
  SessionType,
  ShortcutSendValue,
} from '../../../shared/types'
import * as dom from '../../hooks/dom'
import { startPreparedSessionAttachmentIndexing } from '../../stores/sessionAttachmentRagIndexing'
import * as sessionHelpers from '../../stores/sessionHelpers'
import * as toastActions from '../../stores/toastActions'
import type { PreprocessedFile } from '../../types/input-box'
import { CompactionStatus } from '../chat/CompactionStatus'
import { AdaptiveModal } from '../common/AdaptiveModal'
import { CompressionModal } from '../common/CompressionModal'
import { ScalableIcon } from '../common/ScalableIcon'
import Disclaimer from '../Disclaimer'
import ProviderImageIcon from '../icons/ProviderImageIcon'
import ModelSelectorV2 from '../ModelSelectorV2'
import AgentModeButton from './AgentModeButton'
import { FileMiniCard, getParserTypeLabel, ImageMiniCard } from './Attachments'
import { getAgentModeUIState } from './agentModeState'
import { ImageUploadInput } from './ImageUploadInput'
import { MessageInputField, type MessageInputFieldRef } from './MessageInputField'
import { cleanupFile, markFileProcessing, onFileProcessed, storeFilePromise } from './preprocessState'
import ReasoningControlButton from './ReasoningControlButton'
import { getTrailingSkillCommand, insertSkillCommandText } from './skillCommand'
import TokenCountMenu from './TokenCountMenu'
import { useReasoningControlState } from './useReasoningControlState'

export type InputBoxPayload = {
  constructedMessage: Message
  needGenerating?: boolean
  onUserMessageReady?: () => void
  settingsPatch?: Partial<SessionSettings>
}

export type InputBoxRef = {
  setQuote: (quote: string) => void
}

export type InputBoxProps = {
  sessionId?: string
  sessionType?: SessionType
  generating?: boolean
  /** Number of active replies with a cancellation controller in this runtime. */
  generatingCount?: number
  model?: {
    provider: string
    modelId: string
  }
  fullWidth?: boolean
  onSelectModel?(provider: string, model: string): void
  onSubmit?(payload: InputBoxPayload): Promise<void>
  onStopGenerating?(): boolean
  onStartNewThread?(): boolean
  onRollbackThread?(): boolean
  onClickSessionSettings?(): boolean | Promise<boolean>
}

function mergeSessionAttachmentStatesIntoFiles(
  files: PreprocessedFile[],
  attachments: SessionAttachment[]
): { files: PreprocessedFile[]; changed: boolean } {
  if (files.length === 0 || attachments.length === 0) {
    return { files, changed: false }
  }

  const attachmentStateMap = new Map(attachments.map((attachment) => [attachment.id, attachment]))
  let changed = false
  const nextFiles = files.map((file) => {
    if (!file.sessionAttachmentId) {
      return file
    }
    const attachment = attachmentStateMap.get(file.sessionAttachmentId)
    if (!attachment) {
      return file
    }
    const nextFile = {
      ...file,
      sessionAttachmentAvailability: attachment.availability ?? file.sessionAttachmentAvailability,
      sessionAttachmentIndexStatus: attachment.indexStatus ?? file.sessionAttachmentIndexStatus,
      sessionAttachmentChunkCount: attachment.chunkCount ?? file.sessionAttachmentChunkCount,
      sessionAttachmentTotalChunks: attachment.totalChunks ?? file.sessionAttachmentTotalChunks,
      sessionAttachmentEmbeddedChunks: attachment.embeddedChunks ?? file.sessionAttachmentEmbeddedChunks,
      sessionAttachmentIndexingStage: attachment.indexingStage ?? file.sessionAttachmentIndexingStage,
      error: attachment.error ?? file.error,
    }
    const fileChanged =
      nextFile.sessionAttachmentAvailability !== file.sessionAttachmentAvailability ||
      nextFile.sessionAttachmentIndexStatus !== file.sessionAttachmentIndexStatus ||
      nextFile.sessionAttachmentChunkCount !== file.sessionAttachmentChunkCount ||
      nextFile.sessionAttachmentTotalChunks !== file.sessionAttachmentTotalChunks ||
      nextFile.sessionAttachmentEmbeddedChunks !== file.sessionAttachmentEmbeddedChunks ||
      nextFile.sessionAttachmentIndexingStage !== file.sessionAttachmentIndexingStage ||
      nextFile.error !== file.error
    if (fileChanged) {
      changed = true
    }
    return fileChanged ? nextFile : file
  })

  return { files: nextFiles, changed }
}

function getSessionAttachmentProgressValue(embeddedChunks?: number, totalChunks?: number): number | undefined {
  if (!totalChunks || totalChunks <= 0 || embeddedChunks === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round((embeddedChunks / totalChunks) * 100)))
}

function getSessionAttachmentStageLabel(
  stage: SessionAttachmentIndexingStage | undefined,
  t: (key: string) => string
): string {
  switch (stage) {
    case 'queued':
      return t('Queued')
    case 'chunking':
      return t('Preparing')
    case 'embedding':
      return t('Indexing')
    case 'finalizing':
      return t('Finishing')
    case 'ready':
      return t('Indexed')
    default:
      return t('Indexing')
  }
}

const InputBox = forwardRef<InputBoxRef, InputBoxProps>(
  (
    {
      sessionId,
      sessionType = 'chat',
      generating = false,
      generatingCount = 0,
      model,
      fullWidth = false,
      onSelectModel,
      onSubmit,
      onStopGenerating,
      onStartNewThread,
      onRollbackThread,
      onClickSessionSettings,
    },
    ref
  ) => {
    const modelRegistryVersion = useModelRegistryVersion()

    const { t } = useTranslation()
    const navigate = useNavigate()
    const isSmallScreen = useIsSmallScreen()
    const toolbarIconSize = isSmallScreen ? 22 : 18
    const { height: viewportHeight } = useViewportSize()
    const pasteLongTextAsAFile = useSettingsStore((state) => state.pasteLongTextAsAFile)
    const shortcuts = useSettingsStore((state) => state.shortcuts)
    const widthFull = useUIStore((s) => s.widthFull) || fullWidth
    const saveBlob = useSaveBlob()

    const currentSessionId = sessionId
    const isNewSession = currentSessionId === 'new'

    // Session-level web browsing mode
    const sessionWebBrowsingMap = useUIStore((s) => s.sessionWebBrowsingMap)
    const setSessionWebBrowsing = useUIStore((s) => s.setSessionWebBrowsing)
    const updateCurrentWebBrowsingDisplay = useUIStore((s) => s.updateCurrentWebBrowsingDisplay)
    // Get session-specific value, or fall back to the default (off)
    const webBrowsingMode = useMemo(() => {
      const sessionValue = sessionWebBrowsingMap[currentSessionId || 'new']
      if (sessionValue !== undefined) {
        return sessionValue
      }
      return false
    }, [sessionWebBrowsingMap, currentSessionId, model?.provider])

    // this is used for keyboard shortcut. if we don't provide this, kbd wont know what to set when it's a new session(it doesnt have provider info)
    useEffect(() => {
      updateCurrentWebBrowsingDisplay(currentSessionId || 'new', webBrowsingMode)
    }, [currentSessionId, webBrowsingMode, updateCurrentWebBrowsingDisplay])

    const setWebBrowsingMode = useCallback(
      (enabled: boolean) => {
        setSessionWebBrowsing(currentSessionId || 'new', enabled)
      },
      [currentSessionId, setSessionWebBrowsing]
    )

    // messageInput lives inside the MessageInputField child component to avoid
    // re-rendering the entire InputBox (20+ hooks, 1300+ lines) on every keystroke.
    // The parent only keeps a ref to the latest text and a boolean for empty/non-empty.
    const messageInputFieldRef = useRef<MessageInputFieldRef>(null)
    const latestInputRef = useRef('')
    const [hasTextContent, setHasTextContent] = useState(false)
    const draftMessageIdRef = useRef<string | undefined>(undefined)
    const enabledSkillNames = useSettingsStore((state) => state.skills.enabledSkillNames)
    const [inputSkills, setInputSkills] = useState<Array<{ name: string; description: string }>>([])
    const [inputSkillsLoading, setInputSkillsLoading] = useState(false)
    const [skillCommandQuery, setSkillCommandQuery] = useState<string | null>(null)
    const [skillCommandSelectedIndex, setSkillCommandSelectedIndex] = useState(0)
    const skillCommandQueryRef = useRef<string | null>(null)
    const skillMenuAnchorRef = useRef<HTMLDivElement | null>(null)
    const skillMenuFloatingRef = useRef<HTMLDivElement | null>(null)

    const debouncedUpdateTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const resetHistoryIndexRef = useRef<() => void>(() => {})

    // Called only on real user typing (not programmatic setValue), to avoid resetting history navigation
    const onUserInput = useCallback(() => {
      resetHistoryIndexRef.current()
    }, [])

    const updateSkillCommandQuery = useCallback((query: string | null) => {
      if (skillCommandQueryRef.current === query) return
      skillCommandQueryRef.current = query
      setSkillCommandQuery(query)
      setSkillCommandSelectedIndex(0)
    }, [])

    const onMessageInputValueChange = useCallback(
      (value: string) => {
        latestInputRef.current = value
        const hasContent = value.trim().length > 0
        setHasTextContent((prev) => {
          if (prev === hasContent) return prev
          return hasContent
        })
        const trigger = getTrailingSkillCommand(value)
        const nextSkillCommandQuery = trigger?.query ?? null
        updateSkillCommandQuery(nextSkillCommandQuery)
        // Schedule debounced pre-constructed message update
        clearTimeout(debouncedUpdateTimerRef.current)
        debouncedUpdateTimerRef.current = setTimeout(() => flushRef.current(), 300)
      },
      [updateSkillCommandQuery]
    )

    const loadInputSkills = useCallback(async () => {
      setInputSkillsLoading(true)
      try {
        const allSkills = await skillsController.discoverSkills()
        setInputSkills(allSkills.map((skill) => ({ name: skill.name, description: skill.description })))
      } catch {
        setInputSkills([])
      } finally {
        setInputSkillsLoading(false)
      }
    }, [])

    useEffect(() => {
      if (skillCommandQuery === null || inputSkills.length > 0 || inputSkillsLoading) {
        return
      }
      void loadInputSkills()
    }, [inputSkills.length, inputSkillsLoading, loadInputSkills, skillCommandQuery])

    useEffect(() => {
      return subscribeSkillsChanged(() => {
        setInputSkills([])
      })
    }, [])

    const enabledInputSkills = useMemo(
      () => inputSkills.filter((skill) => enabledSkillNames.includes(skill.name)),
      [enabledSkillNames, inputSkills]
    )
    const matchingInputSkills = useMemo(() => {
      if (skillCommandQuery === null) return []
      const query = skillCommandQuery.trim().toLowerCase()
      const matchingSkills = query
        ? enabledInputSkills.filter(
            (skill) => skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query)
          )
        : enabledInputSkills
      return matchingSkills.slice(0, 8)
    }, [enabledInputSkills, skillCommandQuery])

    useEffect(() => {
      setSkillCommandSelectedIndex((index) => Math.min(index, Math.max(0, matchingInputSkills.length - 1)))
    }, [matchingInputSkills.length])

    const insertSkillCommand = useCallback(
      (skillName: string) => {
        messageInputFieldRef.current?.setValue((prev) => insertSkillCommandText(prev, skillName))
        updateSkillCommandQuery(null)
        setTimeout(() => {
          dom.focusMessageInput()
          dom.setMessageInputCursorToEnd()
        }, 0)
      },
      [updateSkillCommandQuery]
    )

    // Pre-constructed message state (scoped by session)
    const [preConstructedMessage, setPreConstructedMessage] = useAtom(
      atoms.inputBoxPreConstructedMessageFamily(currentSessionId || 'new')
    )
    const preConstructedMessageRef = useRef(preConstructedMessage)
    preConstructedMessageRef.current = preConstructedMessage
    const activeFilePreprocessingKeysRef = useRef(new Set<string>())
    useEffect(() => {
      draftMessageIdRef.current = preConstructedMessage.draftMessageId
    }, [preConstructedMessage.draftMessageId])
    const pictureKeys = preConstructedMessage.pictureKeys || []
    const attachments = preConstructedMessage.attachments || []

    const { session: currentSession } = useSession(sessionId || null)
    const { sessionSettings: currentSessionMergedSettings } = useSessionSettings(sessionId || null)
    const pendingApprovalToolCallId = useMemo(
      () => listPendingApprovalToolCalls(currentSession?.messages ?? [])[0]?.toolCallId,
      [currentSession?.messages]
    )
    const isAwaitingToolApproval = Boolean(pendingApprovalToolCallId)

    const skillMenuOpen = skillCommandQuery !== null && matchingInputSkills.length > 0 && !isAwaitingToolApproval

    // Floating UI autoUpdate：跟随 anchor（含纯 position 变化的响应式过渡），替代手写 RO/rAF 状态机
    useLayoutEffect(() => {
      if (!skillMenuOpen) return
      const reference = skillMenuAnchorRef.current
      const floating = skillMenuFloatingRef.current
      if (!reference || !floating) return

      return autoUpdate(reference, floating, () => {
        void computePosition(reference, floating, {
          placement: 'top-start',
          strategy: 'fixed',
          middleware: [
            offset(4),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
            size({
              padding: 8,
              apply({ availableHeight, rects, elements }) {
                Object.assign(elements.floating.style, {
                  maxHeight: `${Math.max(48, Math.min(208, availableHeight))}px`,
                  width: `${rects.reference.width}px`,
                })
              },
            }),
          ],
        }).then(({ x, y, strategy }) => {
          Object.assign(floating.style, {
            position: strategy,
            left: `${x}px`,
            top: `${y}px`,
          })
        })
      })
    }, [skillMenuOpen, matchingInputSkills.length])

    const { providers } = useProviders()
    const {
      effectiveProviderOptions,
      modelInfo,
      reasoningModelInfo,
      selectedProviderInfo,
      settingsPatch: reasoningSettingsPatch,
      handleReasoningLevelChange,
      markSettingsCommitted: markReasoningSettingsCommitted,
      waitForPendingPersist: waitForReasoningPersist,
    } = useReasoningControlState({
      currentSessionId,
      isNewSession,
      model,
      providers,
      sessionProviderOptions: resolveReasoningProviderOptions(
        currentSessionMergedSettings,
        model?.provider,
        model?.modelId
      ),
    })

    // Get current messages for token counting - will only recalculate when stable messages actually change
    // Uses getContextMessageIds to respect compaction points
    const currentContextMessageIds = useMemo(() => {
      if (isNewSession) return null
      if (!currentSession?.messages.length) return null

      return getContextMessageIds(currentSession, currentSessionMergedSettings?.maxContextMessageCount)
    }, [isNewSession, currentSessionMergedSettings?.maxContextMessageCount, currentSession])

    const { knowledgeBase, setKnowledgeBase } = useKnowledgeBase({ isNewSession })

    // Agent mode value for conditional toolbar rendering
    const agentModeEntry = useSessionAgentMode(currentSessionId || 'new')

    const [showCompressionModal, setShowCompressionModal] = useState(false)

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [unreadyAttachmentSubmitPrompt, setUnreadyAttachmentSubmitPrompt] = useState<{
      opened: boolean
      count: number
    }>({ opened: false, count: 0 })

    const flushPreConstructedMessage = useCallback(() => {
      clearTimeout(debouncedUpdateTimerRef.current)
      const text = latestInputRef.current
      const constructedMessage = sessionHelpers.constructUserMessage(
        preConstructedMessage.draftMessageId,
        text,
        pictureKeys,
        preConstructedMessage.preprocessedFiles,
        []
      )
      setPreConstructedMessage((prev) => ({
        ...prev,
        text,
        pictureKeys,
        attachments,
        links: [],
        message: constructedMessage,
      }))
    }, [
      preConstructedMessage.draftMessageId,
      pictureKeys,
      attachments,
      preConstructedMessage.preprocessedFiles,
      setPreConstructedMessage,
    ])

    const flushRef = useRef(flushPreConstructedMessage)
    flushRef.current = flushPreConstructedMessage

    // When non-text deps change (pictures, attachments), flush immediately
    useEffect(() => {
      flushRef.current()
    }, [flushPreConstructedMessage])

    const pictureInputRef = useRef<HTMLInputElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // Check if any preprocessing is in progress
    const isPreprocessing = useMemo(() => {
      const hasProcessingFiles = Object.values(preConstructedMessage.preprocessingStatus.files || {}).some(
        (status) => status === 'processing'
      )
      return hasProcessingFiles
    }, [preConstructedMessage.preprocessingStatus])

    // Check if any preprocessing has errors
    const hasPreprocessErrors = useMemo(() => {
      const hasErrorFiles = Object.values(preConstructedMessage.preprocessingStatus.files || {}).some(
        (status) => status === 'error'
      )
      return hasErrorFiles
    }, [preConstructedMessage.preprocessingStatus])

    const hasBlockedSessionRagFiles = useMemo(
      () =>
        preConstructedMessage.preprocessedFiles.some(
          (file) => file.ragMode === 'session-retrieval' && file.sessionAttachmentAvailability === 'blocked'
        ),
      [preConstructedMessage.preprocessedFiles]
    )
    const hasSessionRetrievalFiles = useMemo(
      () =>
        preConstructedMessage.preprocessedFiles.some(
          (file) => file.ragMode === 'session-retrieval' && file.sessionAttachmentAvailability !== 'blocked'
        ),
      [preConstructedMessage.preprocessedFiles]
    )
    const hasLargeAttachmentWarning = useMemo(
      () =>
        preConstructedMessage.preprocessedFiles.some(
          (file) =>
            file.sessionAttachmentWarningReason === sessionHelpers.SESSION_ATTACHMENT_RAG_LARGE_ATTACHMENT_WARNING
        ),
      [preConstructedMessage.preprocessedFiles]
    )

    const disableSubmit = useMemo(
      () => !(hasTextContent || attachments?.length || pictureKeys?.length),
      [hasTextContent, attachments, pictureKeys]
    )

    const preprocessedSessionAttachmentIds = useMemo(
      () =>
        Array.from(
          new Set(
            preConstructedMessage.preprocessedFiles.flatMap((file) =>
              file.sessionAttachmentId ? [file.sessionAttachmentId] : []
            )
          )
        ),
      [preConstructedMessage.preprocessedFiles]
    )
    const { data: preprocessedAttachmentStates = [] } = useQuery<SessionAttachment[]>({
      queryKey: [
        'input-box-session-attachment-rag-attachments',
        ...preprocessedSessionAttachmentIds.sort((a, b) => a - b),
      ],
      queryFn: () => {
        if (platform.type !== 'desktop' || preprocessedSessionAttachmentIds.length === 0) {
          return []
        }
        return platform.getSessionAttachmentRagController().getAttachments(preprocessedSessionAttachmentIds)
      },
      enabled: platform.type === 'desktop' && preprocessedSessionAttachmentIds.length > 0,
      refetchInterval: (query): number | false => {
        const attachments = (query.state.data as SessionAttachment[] | undefined) ?? []
        return attachments.some(
          (attachment) => attachment.indexStatus === 'pending' || attachment.indexStatus === 'indexing'
        )
          ? 1500
          : false
      },
    })
    const preprocessedAttachmentIndexStatusMap = useMemo(
      () => new Map(preprocessedAttachmentStates.map((attachment) => [attachment.id, attachment.indexStatus])),
      [preprocessedAttachmentStates]
    )
    const preprocessedAttachmentErrorMap = useMemo(
      () => new Map(preprocessedAttachmentStates.map((attachment) => [attachment.id, attachment.error])),
      [preprocessedAttachmentStates]
    )
    const preprocessedAttachmentProgressMap = useMemo(
      () =>
        new Map(
          preprocessedAttachmentStates.map((attachment) => [
            attachment.id,
            {
              totalChunks: attachment.totalChunks ?? 0,
              embeddedChunks: attachment.embeddedChunks ?? 0,
              indexingStage: attachment.indexingStage,
              processingStartedAt: attachment.processingStartedAt,
            },
          ])
        ),
      [preprocessedAttachmentStates]
    )
    useEffect(() => {
      if (preprocessedAttachmentStates.length === 0) {
        return
      }
      setPreConstructedMessage((prev) => {
        const result = mergeSessionAttachmentStatesIntoFiles(prev.preprocessedFiles, preprocessedAttachmentStates)
        return result.changed ? { ...prev, preprocessedFiles: result.files } : prev
      })
    }, [preprocessedAttachmentStates, setPreConstructedMessage])
    const modelSelectorDisplayText = useMemo(() => {
      if (!model) {
        return t('Select Model')
      }
      const modelInfo = (selectedProviderInfo?.models || selectedProviderInfo?.defaultSettings?.models)?.find(
        (m) => m.modelId === model.modelId
      )
      return `${modelInfo?.nickname || model.modelId}`
    }, [selectedProviderInfo, model, t])

    // When agent mode is on, block models that don't support agent tools in the model selector.
    const agentModeDisabledMessage = t('This model does not support Agent Mode')
    const modelDisabledCheck = useCallback(
      (m: ProviderModelInfo) => {
        if (agentModeEntry.value !== 'on') return undefined
        if (!m.capabilities?.includes('tool_use')) return agentModeDisabledMessage
        if (isDeepSeekWeakToolUse(m.modelId, 'agent')) return agentModeDisabledMessage
        return undefined
      },
      [agentModeDisabledMessage, agentModeEntry.value]
    )

    // Check model tool use capabilities for agent mode and file handling.
    // Uses 'agent' scope as the gate — models with weak function calling
    // (e.g. DeepSeek V3/R1) return false, disabling agent mode entirely.
    const {
      data: modelToolCapabilities = { agentMode: false, readFile: false },
      isFetched: isModelToolCapabilityFetched,
    } = useQuery({
      queryKey: ['model-tool-capability', model?.provider, model?.modelId],
      queryFn: async () => {
        if (!model?.provider || !model?.modelId) {
          return { agentMode: false, readFile: false }
        }

        try {
          const globalSettings = settingsStore.getState().getSettings()
          const configs = await platform.getConfig()
          const dependencies = await createModelDependencies()

          const settings = {
            provider: model.provider,
            modelId: model.modelId,
            ...currentSessionMergedSettings,
          }

          const modelInstance = getModel(settings, globalSettings, configs, dependencies)
          return {
            agentMode: modelInstance.isSupportToolUse('agent'),
            readFile: modelInstance.isSupportToolUse('read-file'),
          }
        } catch (e) {
          console.debug('useModelToolCapability: failed to check capability', e)
          return { agentMode: false, readFile: false }
        }
      },
      enabled: !!(model?.provider && model?.modelId),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })
    const modelSupportToolUseForFile = modelToolCapabilities.readFile
    const modelSupportsAgentMode = modelToolCapabilities.agentMode
    const showSessionRetrievalToolWarning =
      hasSessionRetrievalFiles && isModelToolCapabilityFetched && !modelSupportToolUseForFile
    const agentModeUIState = useMemo(
      () => getAgentModeUIState(agentModeEntry, model ? modelSupportsAgentMode : true),
      [agentModeEntry, model, modelSupportsAgentMode]
    )

    // Determine sandbox mode: files exist in session and model supports tool use for files
    const sandboxMode = useMemo(() => {
      if (!modelSupportToolUseForFile || !currentSession) return false
      return currentSession.messages.some((m) => m.files?.length)
    }, [modelSupportToolUseForFile, currentSession?.messages])

    // Calculate token counts using unified cache layer
    const { contextTokens, currentInputTokens, totalTokens, isCalculating, pendingTasks, messageCount } =
      useContextTokens({
        sessionId: currentSessionId || null,
        session: currentSession,
        settings: currentSessionMergedSettings || {},
        model,
        modelSupportToolUseForFile,
        sandboxMode,
        constructedMessage: preConstructedMessage.message,
      })

    const globalAutoCompaction = useSettingsStore((state) => state.autoCompaction)
    const [isCompacting, setIsCompacting] = useState(false)

    const compactionUIStateMap = useAtomValue(compactionUIStateMapAtom)
    const isCompactionRunning = useMemo(() => {
      if (!currentSessionId || isNewSession) return false
      return compactionUIStateMap[currentSessionId]?.status === 'running'
    }, [compactionUIStateMap, currentSessionId, isNewSession])
    const submitBlocked =
      disableSubmit ||
      isPreprocessing ||
      isSubmitting ||
      isCompactionRunning ||
      isAwaitingToolApproval ||
      hasPreprocessErrors ||
      hasBlockedSessionRagFiles

    const autoCompactionEnabled = useMemo(() => {
      if (!currentSession) return globalAutoCompaction ?? true
      return isAutoCompactionEnabled(currentSession.settings, settingsStore.getState())
    }, [currentSession, globalAutoCompaction])

    const contextWindowKnown = useMemo(() => {
      if (!model?.modelId) return false
      if (modelInfo?.contextWindow) return true
      if (model?.provider && getProviderModelContextWindowSync(model.provider, model.modelId) !== null) return true
      // Fallback: provider-agnostic lookup (same as compaction detector)
      return getModelContextWindowSync(model.modelId) !== null
    }, [model?.modelId, model?.provider, modelInfo?.contextWindow, modelRegistryVersion])

    // Use model setting contextWindow if available, otherwise fallback to models.dev data
    const effectiveContextWindow = useMemo(() => {
      if (modelInfo?.contextWindow) return modelInfo.contextWindow
      if (model?.provider && model?.modelId) {
        const providerWindow = getProviderModelContextWindowSync(model.provider, model.modelId)
        if (providerWindow !== null) return providerWindow
      }
      // Fallback: provider-agnostic lookup (same as compaction detector)
      if (model?.modelId) return getModelContextWindowSync(model.modelId)
      return null
    }, [modelInfo?.contextWindow, model?.modelId, model?.provider, modelRegistryVersion])

    // Calculate token usage percentage
    const tokenPercentage = useMemo(() => {
      if (!effectiveContextWindow || effectiveContextWindow <= 0) return null
      return Math.round((totalTokens / effectiveContextWindow) * 100)
    }, [totalTokens, effectiveContextWindow])

    useEffect(() => {
      if (!currentSessionId || isNewSession) {
        setIsCompacting(false)
        return
      }
      const checkCompacting = () => {
        setIsCompacting(isCompactionInProgress(currentSessionId))
      }
      checkCompacting()
      const interval = setInterval(checkCompacting, 1000)
      return () => clearInterval(interval)
    }, [currentSessionId, isNewSession])

    const handleAutoCompactionChange = useCallback(
      async (enabled: boolean) => {
        if (!currentSessionId || isNewSession) return
        await chatStore.updateSession(currentSessionId, (session) => {
          if (!session) {
            throw new Error('Session not found')
          }
          return {
            ...session,
            settings: {
              ...session.settings,
              autoCompaction: enabled,
            },
          }
        })
      },
      [currentSessionId, isNewSession]
    )

    const [showRollbackThreadButton, setShowRollbackThreadButton] = useState(false)
    useEffect(() => {
      if (showRollbackThreadButton) {
        const tid = setTimeout(() => {
          setShowRollbackThreadButton(false)
        }, 5000)
        return () => {
          clearTimeout(tid)
        }
      }
    }, [showRollbackThreadButton])

    useImperativeHandle(
      ref,
      () => ({
        // 暂时并没有用到，还是使用了之前atom的方案
        setQuote: (data) => {
          messageInputFieldRef.current?.setValue((prev) => `${prev}\n\n${data}`)
          dom.focusMessageInput()
          dom.setMessageInputCursorToEnd()
        },
      }),
      []
    )

    const { addInputBoxHistory, getPreviousHistoryInput, getNextHistoryInput, resetHistoryIndex } = useInputBoxHistory()
    resetHistoryIndexRef.current = resetHistoryIndex

    type SubmitOptions = { allowUnreadySessionAttachments?: boolean }
    type InsertFilesOptions = { source?: 'pasted-text' }
    const handleSubmitRef = useRef<(needGenerating?: boolean, options?: SubmitOptions) => void>(() => {})
    const getPreviousHistoryInputRef = useRef(getPreviousHistoryInput)
    getPreviousHistoryInputRef.current = getPreviousHistoryInput
    const getNextHistoryInputRef = useRef(getNextHistoryInput)
    getNextHistoryInputRef.current = getNextHistoryInput
    const insertFilesRef = useRef<(files: File[], options?: InsertFilesOptions) => void>(() => {})

    const handleSubmit = async (needGenerating = true, options: SubmitOptions = {}) => {
      if (
        disableSubmit ||
        generating ||
        isSubmitting ||
        isPreprocessing ||
        isAwaitingToolApproval ||
        hasPreprocessErrors ||
        hasBlockedSessionRagFiles
      ) {
        return
      }

      if (!model) {
        return
      }

      // Cancel any pending debounce so it won't overwrite the reset after send
      clearTimeout(debouncedUpdateTimerRef.current)

      setIsSubmitting(true)
      try {
        let preprocessedFilesForSubmit = preConstructedMessage.preprocessedFiles
        const submitSessionAttachmentIds = Array.from(
          new Set(
            preprocessedFilesForSubmit.flatMap((file) => (file.sessionAttachmentId ? [file.sessionAttachmentId] : []))
          )
        )
        if (platform.type === 'desktop' && submitSessionAttachmentIds.length > 0) {
          const latestAttachmentStates = await platform
            .getSessionAttachmentRagController()
            .getAttachments(submitSessionAttachmentIds)
          const result = mergeSessionAttachmentStatesIntoFiles(preprocessedFilesForSubmit, latestAttachmentStates)
          preprocessedFilesForSubmit = result.files
          if (result.changed) {
            setPreConstructedMessage((prev) => ({ ...prev, preprocessedFiles: result.files }))
          }
        }
        const unreadySessionAttachments = preprocessedFilesForSubmit.filter(
          (file) =>
            file.ragMode === 'session-retrieval' &&
            file.sessionAttachmentAvailability !== 'blocked' &&
            (file.sessionAttachmentIndexStatus ?? 'pending') !== 'ready'
        )
        if (unreadySessionAttachments.length > 0 && !options.allowUnreadySessionAttachments) {
          setUnreadyAttachmentSubmitPrompt({ opened: true, count: unreadySessionAttachments.length })
          return
        }

        // Build the message with the latest input text, bypassing debounce delay
        const latestMessage = sessionHelpers.constructUserMessage(
          preConstructedMessage.draftMessageId,
          latestInputRef.current,
          pictureKeys,
          preprocessedFilesForSubmit,
          []
        )
        if (!latestMessage) {
          console.error('No constructed message available')
          return
        }

        const messageTextForHistory = latestMessage.contentParts.find((p) => p.type === 'text')?.text || ''

        const params = {
          constructedMessage: latestMessage,
          needGenerating,
          settingsPatch: reasoningSettingsPatch,
          onUserMessageReady: () => {
            messageInputFieldRef.current?.clearDraft()
            draftMessageIdRef.current = undefined
            setPreConstructedMessage({
              draftMessageId: undefined,
              text: '',
              pictureKeys: [],
              attachments: [],
              links: [],
              preprocessedFiles: [],
              preprocessedLinks: [],
              preprocessingStatus: {
                files: {},
                links: {},
              },
              preprocessingPromises: {
                files: new Map(),
                links: new Map(),
              },
              message: undefined,
            })
            setShowRollbackThreadButton(false)
            markReasoningSettingsCommitted()
            if (platform.type !== 'mobile' && messageTextForHistory) {
              addInputBoxHistory(messageTextForHistory)
            }
          },
        }

        // Ensure an in-flight reasoning-level persist has landed before generation reads session settings
        await waitForReasoningPersist()

        await onSubmit?.(params)

        trackingEvent('send_message', { event_category: 'user' })
      } catch (e) {
        console.error('Error submitting message:', e)
        toastActions.add((e as Error)?.message || t('An error occurred while sending the message.'))
      } finally {
        setIsSubmitting(false)
      }
    }
    handleSubmitRef.current = handleSubmit

    const onKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (skillCommandQuery !== null && matchingInputSkills.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setSkillCommandSelectedIndex((index) => (index + 1) % matchingInputSkills.length)
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setSkillCommandSelectedIndex(
              (index) => (index - 1 + matchingInputSkills.length) % matchingInputSkills.length
            )
            return
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            const selectedSkill = matchingInputSkills[skillCommandSelectedIndex]
            if (selectedSkill) {
              insertSkillCommand(selectedSkill.name)
            }
            return
          }
        }
        if (skillCommandQuery !== null && event.key === 'Escape') {
          event.preventDefault()
          updateSkillCommandQuery(null)
          return
        }

        const isPressedHash: Record<ShortcutSendValue, boolean> = {
          '': false,
          Enter: event.keyCode === 13 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey,
          'CommandOrControl+Enter': event.keyCode === 13 && (event.ctrlKey || event.metaKey) && !event.shiftKey,
          'Ctrl+Enter': event.keyCode === 13 && event.ctrlKey && !event.shiftKey,
          'Command+Enter': event.keyCode === 13 && event.metaKey,
          'Shift+Enter': event.keyCode === 13 && event.shiftKey,
          'Ctrl+Shift+Enter': event.keyCode === 13 && event.ctrlKey && event.shiftKey,
        }
        const isSendShortcut = isPressedHash[shortcuts.inputBoxSendMessage]
        const isSendWithoutResponseShortcut = isPressedHash[shortcuts.inputBoxSendMessageWithoutResponse]

        // 发送消息
        if (isSendShortcut) {
          if (platform.type === 'mobile' && isSmallScreen && shortcuts.inputBoxSendMessage === 'Enter') {
            // 移动端点击回车不会发送消息
            return
          }
          event.preventDefault()
          handleSubmitRef.current()
          return
        }

        // 发送消息但不生成回复
        if (isSendWithoutResponseShortcut) {
          event.preventDefault()
          handleSubmitRef.current(false)
          return
        }

        // 向上向下键翻阅历史消息
        const currentInput = latestInputRef.current
        const inputElement = messageInputFieldRef.current?.getElement()
        if (
          (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
          inputElement &&
          inputElement === document.activeElement && // 聚焦在输入框
          (currentInput.length === 0 || window.getSelection()?.toString() === currentInput) // 要么为空，要么输入框全选
        ) {
          event.preventDefault()
          if (event.key === 'ArrowUp') {
            const previousInput = getPreviousHistoryInputRef.current()
            if (previousInput !== undefined) {
              messageInputFieldRef.current?.setValue(previousInput)
              setTimeout(() => inputElement?.select(), 10)
            }
          } else if (event.key === 'ArrowDown') {
            const nextInput = getNextHistoryInputRef.current()
            if (nextInput !== undefined) {
              messageInputFieldRef.current?.setValue(nextInput)
              setTimeout(() => inputElement?.select(), 10)
            }
          }
        }

        // Prevent Chromium's native Escape behaviour which reverts textarea
        // value to its defaultValue, causing controlled-input state to desync.
        if (event.key === 'Escape') {
          event.preventDefault()
          messageInputFieldRef.current?.getElement()?.blur()
        }
      },
      [
        insertSkillCommand,
        isSmallScreen,
        matchingInputSkills,
        shortcuts,
        skillCommandQuery,
        skillCommandSelectedIndex,
        updateSkillCommandQuery,
      ]
    )

    const startNewThread = () => {
      const res = onStartNewThread?.()
      if (res) {
        setShowRollbackThreadButton(true)
      }
    }

    const rollbackThread = () => {
      const res = onRollbackThread?.()
      if (res) {
        setShowRollbackThreadButton(false)
      }
    }

    const startFilePreprocessing = (file: File, options: InsertFilesOptions = {}) => {
      const fileKey = StorageKeyGenerator.fileUniqKey(file)
      activeFilePreprocessingKeysRef.current.add(fileKey)

      // 异步预处理文件，失败时标记为 error，并吞掉异常避免 Promise.all reject
      return sessionHelpers
        .prepareFileAttachment(
          file,
          { provider: model?.provider || '', modelId: model?.modelId || '' },
          { agentMode: isAgentModeActive, source: options.source }
        )
        .then(async (preprocessedFile) => {
          if (!activeFilePreprocessingKeysRef.current.has(fileKey)) {
            return
          }

          let nextPreprocessedFile: PreprocessedFile = preprocessedFile
          if (platform.type === 'desktop') {
            const draftMessageId = draftMessageIdRef.current || uuidv4()
            const indexedFile = await startPreparedSessionAttachmentIndexing({
              file,
              preparedFile: nextPreprocessedFile,
              sessionId: currentSessionId || 'new',
              draftMessageId,
              shouldContinue: () => activeFilePreprocessingKeysRef.current.has(fileKey),
            })
            if (!indexedFile) {
              return
            }
            nextPreprocessedFile = indexedFile
            if (indexedFile.draftMessageId) {
              draftMessageIdRef.current = indexedFile.draftMessageId
            }
          }

          setPreConstructedMessage((prev) =>
            onFileProcessed(prev, file, nextPreprocessedFile, 20, { fileKeys: [fileKey] })
          )
        })
        .catch((error) => {
          if (!activeFilePreprocessingKeysRef.current.has(fileKey)) {
            return
          }
          setPreConstructedMessage((prev) =>
            onFileProcessed(
              prev,
              file,
              {
                file,
                content: '',
                storageKey: '',
                error: (error as Error)?.message || 'Failed to preprocess the file.',
              },
              20,
              { fileKeys: [fileKey] }
            )
          )
        })
        .finally(() => {
          activeFilePreprocessingKeysRef.current.delete(fileKey)
        })
    }

    // In agent mode, allow all file types (sandbox can handle archives, binaries, etc.)
    // isActive is true only for 'on' — 'auto' and mobile/web behave like normal mode,
    // so they keep the standard file-type validation and accept filter.
    const isAgentModeActive = agentModeUIState.isActive

    const insertFiles = async (files: File[], options: InsertFilesOptions = {}) => {
      const MAX_IMAGES = 8
      const MAX_ATTACHMENTS = 20
      // 用本地累加器跟踪本次新增数量：同步循环内 state/ref 可能尚未刷新，靠它做无竞态的限额判断
      let imageCount = preConstructedMessageRef.current.pictureKeys?.length || 0
      let attachmentCount = preConstructedMessageRef.current.attachments?.length || 0
      let droppedImages = 0
      let droppedAttachments = 0

      for (const file of files) {
        // 文件和图片插入方法复用，会导致 svg、gif 这类不支持的图片也被插入，但暂时没看到有什么问题
        if (file.type.startsWith('image/')) {
          // 超过上限时直接跳过：保留最先添加的前 8 张，且不浪费转码/不产生孤儿 blob
          if (imageCount >= MAX_IMAGES) {
            droppedImages++
            continue
          }
          const base64 = await picUtils.getImageBase64AndResize(file)
          const key = StorageKeyGenerator.picture('input-box')
          await saveBlob.mutateAsync({ key, value: base64 })
          setPreConstructedMessage((prev) => ({
            ...prev,
            pictureKeys: [...(prev.pictureKeys || []), key].slice(0, MAX_IMAGES), // 保留最先添加的前 8 张
          }))
          imageCount++
        } else {
          if (file.size > KNOWLEDGE_BASE_MAX_FILE_SIZE) {
            toastActions.add(
              t('Chat attachments must be {{limit}} or smaller.', {
                limit: KNOWLEDGE_BASE_MAX_FILE_SIZE_LABEL,
              })
            )
            continue
          }

          // In agent mode, skip file type validation (sandbox handles any file type)
          if (!isAgentModeActive && !isSupportedFile(file.name)) {
            const unsupportedType = getUnsupportedFileType(file.name)
            let errorMsg = t('Unsupported file type: {{fileName}}', { fileName: file.name })
            if (unsupportedType === 'iwork') {
              errorMsg = t('iWork files (Pages, Keynote) are not supported. Please export to PDF or Office format.')
            } else if (unsupportedType === 'audio') {
              errorMsg = t('Audio files are not supported')
            } else if (unsupportedType === 'video') {
              errorMsg = t('Video files are not supported')
            } else if (unsupportedType === 'binary') {
              errorMsg = t('Binary/executable files are not supported')
            } else if (unsupportedType === 'archive') {
              errorMsg = t('Archive files are not supported. Please extract and upload individual files.')
            } else if (unsupportedType === 'image') {
              errorMsg = t('Advanced image formats are not supported. Please convert to JPG or PNG.')
            }
            toastActions.add(errorMsg)
            continue
          }

          // 已存在的文件视为重复（不占新增名额），新文件超过上限时直接跳过：保留最先添加的前 20 个
          const isDuplicate = (preConstructedMessageRef.current.attachments || []).some(
            (f) => StorageKeyGenerator.fileUniqKey(f) === StorageKeyGenerator.fileUniqKey(file)
          )
          if (!isDuplicate && attachmentCount >= MAX_ATTACHMENTS) {
            droppedAttachments++
            continue
          }

          setPreConstructedMessage((prev) => {
            const draftMessageId = prev.draftMessageId || draftMessageIdRef.current || uuidv4()
            draftMessageIdRef.current = draftMessageId
            const newAttachments = prev.attachments.find(
              (f) => StorageKeyGenerator.fileUniqKey(f) === StorageKeyGenerator.fileUniqKey(file)
            )
              ? prev.attachments
              : [...(prev.attachments || []), file].slice(0, MAX_ATTACHMENTS) // 保留最先添加的前 20 个

            // 只预处理实际保留下来的文件（findIndex 返回 -1 表示已被裁剪，跳过，避免残留状态阻塞发送）
            const fileIndex = newAttachments.findIndex(
              (f) => f.name === file.name && f.lastModified === file.lastModified
            )
            if (fileIndex >= 0 && fileIndex < MAX_ATTACHMENTS) {
              const preprocessPromise = startFilePreprocessing(file, options)
              return {
                ...storeFilePromise(markFileProcessing({ ...prev, draftMessageId }, file), file, preprocessPromise),
                attachments: newAttachments,
              }
            }

            return {
              ...prev,
              draftMessageId,
              attachments: newAttachments,
            }
          })
          if (!isDuplicate) {
            attachmentCount++
          }
        }
      }

      if (droppedImages > 0) {
        toastActions.add(
          t('You can attach up to {{limit}} images. The extra images were skipped.', { limit: MAX_IMAGES })
        )
      }
      if (droppedAttachments > 0) {
        toastActions.add(
          t('You can attach up to {{limit}} files. The extra files were skipped.', { limit: MAX_ATTACHMENTS })
        )
      }
    }
    insertFilesRef.current = insertFiles

    const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) {
        return
      }
      insertFiles(Array.from(event.target.files))
      event.target.value = ''
      dom.focusMessageInput()
    }

    const onImageUploadClick = () => {
      pictureInputRef.current?.click()
    }
    const onFileUploadClick = () => {
      fileInputRef.current?.click()
    }

    const onImageDeleteClick = async (picKey: string) => {
      setPreConstructedMessage((prev) => ({
        ...prev,
        pictureKeys: (prev.pictureKeys || []).filter((k) => k !== picKey),
      }))
      // 不删除图片数据，因为可能在其他地方引用，比如通过上下键盘的历史消息快捷输入、发送的消息中引用
      // await storage.delBlob(picKey)
    }

    const onPaste = useCallback(
      (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (sessionType === 'picture') {
          return
        }

        if (event.clipboardData?.items) {
          // 对于 Doc/PPT/XLS 等文件中的内容，粘贴时一般会有 4 个 items，分别是 text 文本、html、某格式和图片
          // 因为 getAsString 为异步操作，无法根据 items 中的内容来定制不同的粘贴行为，因此这里选择了最简单的做法：
          // 保持默认的粘贴行为，这时候会粘贴从文档中复制的文本和图片。我认为应该保留图片，因为文档中的表格、图表等图片信息也很重要，很难通过文本格式来表述。
          // 仅在只粘贴图片或文件时阻止默认行为，防止插入文件或图片的名字
          let hasText = false
          // Capture pre-paste text before async getAsString callback runs (browser will have inserted pasted text by then)
          const prePasteText = latestInputRef.current
          for (let i = 0; i < event.clipboardData.items.length; i++) {
            const item = event.clipboardData.items[i]
            if (item.kind === 'file') {
              // Insert files and images
              const file = item.getAsFile()
              if (file) {
                insertFilesRef.current([file])
              }
              continue
            }
            hasText = true
            if (item.kind === 'string' && item.type === 'text/plain') {
              item.getAsString((text) => {
                const raw = text.trim()
                if (pasteLongTextAsAFile && raw.length > 3000) {
                  const file = new File([text], `pasted_text_${Date.now()}.txt`, {
                    type: 'text/plain',
                  })
                  insertFilesRef.current([file], { source: 'pasted-text' })
                  messageInputFieldRef.current?.setValue(prePasteText) // 删除掉默认粘贴进去的长文本
                }
              })
            }
          }
          // 如果没有任何文本，则说明只是复制了图片或文件。这里阻止默认行为，防止插入文件或图片的名字
          if (!hasText) {
            event.preventDefault()
          }
        }
      },
      [sessionType, pasteLongTextAsAFile]
    )

    // 拖拽上传
    const { getRootProps, getInputProps } = useDropzone({
      onDrop: (acceptedFiles: File[], fileRejections) => {
        insertFiles(acceptedFiles)
        // Show toast for rejected files (only in non-agent mode, agent mode accepts all)
        if (fileRejections.length > 0) {
          const rejectedNames = fileRejections.map((r) => r.file.name).join(', ')
          toastActions.add(t('Unsupported file type: {{fileName}}', { fileName: rejectedNames }))
        }
      },
      // In agent mode, accept all file types; otherwise restrict to supported formats
      accept: isAgentModeActive ? undefined : getFileAcceptConfig(),
      noClick: true,
      noKeyboard: true,
    })

    // 引用消息
    const quote = useUIStore((state) => state.quote)
    const setQuote = useUIStore((state) => state.setQuote)
    // const [quote, setQuote] = useUIStore(state => [state]) useAtom(atoms.quoteAtom)
    // biome-ignore lint/correctness/useExhaustiveDependencies: todo
    useEffect(() => {
      if (quote !== '') {
        // TODO: 支持引用消息中的图片
        // TODO: 支持引用消息中的文件
        setQuote('')
        messageInputFieldRef.current?.setValue((val) => {
          const newValue = !val
            ? quote
            : val + '\n'.repeat(Math.max(0, 2 - (val.match(/(\n)+$/)?.[0].length || 0))) + quote
          return newValue
        })
        // setPreviousMessageQuickInputMark('')
        dom.focusMessageInput()
        dom.setMessageInputCursorToEnd()
      }
    }, [quote])

    const handleKnowledgeBaseSelect = useCallback(
      (kb: KnowledgeBase | null) => {
        if (!kb || kb.id === knowledgeBase?.id) {
          setKnowledgeBase(undefined)
          trackEvent('knowledge_base_disabled', { knowledge_base_name: knowledgeBase?.name })
        } else {
          setKnowledgeBase(pick(kb, 'id', 'name'))
          trackEvent('knowledge_base_enabled', { knowledge_base_name: kb.name })
        }
      },
      [knowledgeBase, setKnowledgeBase]
    )

    // Show deprecated notice for legacy picture sessions
    if (sessionType === 'picture') {
      return (
        <Box pt={0} pb={isSmallScreen ? 'md' : 'sm'} px="sm" id={dom.InputBoxID}>
          <Stack
            className={cn(
              'rounded-lg bg-chatbox-background-secondary shadow-[0_8px_48px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_48px_-8px_rgba(0,0,0,0.5)]',
              widthFull ? 'w-full' : 'max-w-4xl mx-auto'
            )}
            gap="xs"
            p="md"
            align="center"
          >
            <Text size="sm" c="chatbox-tertiary" ta="center">
              {t('This image session is no longer active. Please use the new Image Creator for image generation.')}
            </Text>
            <Button variant="light" size="xs" onClick={() => navigate({ to: '/image-creator' })}>
              {t('Go to Image Creator')}
            </Button>
          </Stack>
        </Box>
      )
    }

    return (
      <Box
        pt={0}
        pb={isSmallScreen ? 'md' : 'sm'}
        px="sm"
        id={dom.InputBoxID}
        className="overflow-visible"
        {...getRootProps()}
      >
        <input className="hidden" {...getInputProps()} />
        <Stack className={cn('overflow-visible', widthFull ? 'w-full' : 'max-w-4xl mx-auto')} gap="xs">
          {currentSessionId && <CompactionStatus sessionId={currentSessionId} />}
          <Box
            ref={skillMenuAnchorRef}
            className={cn(
              // min-h + justify-between 必须同层，桌面空输入时工具栏贴底
              'relative flex flex-col justify-between gap-xs rounded-lg bg-chatbox-background-secondary px-3 py-2 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.3)]',
              !isSmallScreen && 'min-h-[92px]'
            )}
            style={{ border: '0.5px solid var(--chatbox-border-primary)' }}
          >
            {/*
              skill 列表：Portal + Floating UI autoUpdate
              - 不撑高 InputBox；逃出 overflow-hidden
              - 持续跟随 anchor（含双向 resize / 纯 position 过渡）
              - size middleware 按可用高度限 maxHeight
            */}
            {skillMenuOpen &&
              createPortal(
                <Box
                  ref={skillMenuFloatingRef}
                  className="z-[400] overflow-y-auto rounded-lg border border-solid border-chatbox-border-primary bg-chatbox-background-primary py-1 shadow-lg"
                  style={{ position: 'fixed', top: 0, left: 0 }}
                >
                  {matchingInputSkills.map((skill, index) => (
                    <UnstyledButton
                      key={skill.name}
                      className={cn(
                        'flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors',
                        index === skillCommandSelectedIndex
                          ? 'bg-chatbox-background-tertiary'
                          : 'hover:bg-chatbox-background-tertiary'
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertSkillCommand(skill.name)}
                    >
                      <IconWand
                        size={14}
                        strokeWidth={1.8}
                        className="mt-0.5 shrink-0 text-[var(--chatbox-tint-secondary)]"
                      />
                      <Stack gap={1} className="min-w-0 flex-1">
                        <Text size="sm" truncate c="chatbox-primary">
                          /{skill.name}
                        </Text>
                        {skill.description && (
                          <Text size="xs" c="chatbox-secondary" lineClamp={1}>
                            {skill.description}
                          </Text>
                        )}
                      </Stack>
                    </UnstyledButton>
                  ))}
                </Box>,
                document.body
              )}

            {/* Input Row */}
            <Flex
              align="flex-end"
              gap={4}
              // Clicking the locked input while approval is pending surfaces the
              // floating approval pill even when the card is visible in the list.
              onClickCapture={
                pendingApprovalToolCallId ? () => notifyApprovalInputNudge(pendingApprovalToolCallId) : undefined
              }
            >
              <MessageInputField
                ref={messageInputFieldRef}
                isNewSession={isNewSession}
                viewportHeight={viewportHeight}
                isReadOnly={isCompactionRunning || isAwaitingToolApproval}
                placeholder={
                  isAwaitingToolApproval ? t('Waiting for approval') || '' : t('Type your question here...') || ''
                }
                ariaLabel={t('Type your question here...') || ''}
                autoFocus={!isSmallScreen}
                onValueChange={onMessageInputValueChange}
                onUserInput={onUserInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
              />

              {/* Send Button */}
              <Tooltip
                // `n` rather than `count`, so i18next does not engage plural resolution for a
                // label that is only ever shown for more than one reply.
                label={generatingCount > 1 ? t('Stop all {{n}} replies', { n: generatingCount }) : t('Stop')}
                disabled={!generating}
                withArrow
              >
                <ActionIcon
                  data-testid={generating ? TestId.chat.stop : TestId.chat.send}
                  disabled={submitBlocked && !generating}
                  size={32}
                  variant="filled"
                  color={generating ? 'dark' : 'chatbox-brand'}
                  radius="lg"
                  onClick={generating ? onStopGenerating : () => handleSubmit()}
                  className={cn('shrink-0 mb-1', !generating && submitBlocked && 'disabled:!opacity-100 !text-white')}
                  style={!generating && submitBlocked ? { backgroundColor: 'rgba(222, 226, 230, 1)' } : undefined}
                >
                  {generating ? (
                    <ScalableIcon icon={IconPlayerStopFilled} size={16} />
                  ) : (
                    <ScalableIcon icon={IconArrowUp} size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
            </Flex>

            {(!!pictureKeys.length || !!attachments.length) && (
              <Flex
                align="center"
                wrap="wrap"
                className="max-h-[30vh] overflow-y-auto"
                onClick={() => dom.focusMessageInput()}
              >
                {showSessionRetrievalToolWarning && (
                  <Flex
                    role="status"
                    aria-live="polite"
                    align="center"
                    gap={8}
                    className="w-full rounded-lg px-2.5 py-2 mb-1"
                    style={{
                      border: '1px solid var(--chatbox-border-primary)',
                      borderLeft: '3px solid var(--chatbox-tint-warning)',
                      background: 'var(--chatbox-background-primary)',
                    }}
                  >
                    <Box
                      className="flex items-center justify-center rounded-full shrink-0"
                      style={{
                        width: 20,
                        height: 20,
                        background: 'var(--chatbox-background-secondary)',
                        color: 'var(--chatbox-tint-warning)',
                      }}
                    >
                      <ScalableIcon icon={IconAlertCircle} size={14} />
                    </Box>
                    <Text size="xs" lh={1.35} c="chatbox-warning" className="min-w-0">
                      {t(
                        'This model may not be able to read the uploaded document. Try another model if you want to ask about the file.'
                      )}
                    </Text>
                  </Flex>
                )}
                {hasLargeAttachmentWarning && (
                  <Flex
                    role="status"
                    aria-live="polite"
                    align="center"
                    gap={8}
                    className="w-full rounded-lg px-2.5 py-2 mb-1"
                    style={{
                      border: '1px solid var(--chatbox-border-primary)',
                      borderLeft: '3px solid var(--chatbox-tint-warning)',
                      background: 'var(--chatbox-background-primary)',
                    }}
                  >
                    <Box
                      className="flex items-center justify-center rounded-full shrink-0"
                      style={{
                        width: 20,
                        height: 20,
                        background: 'var(--chatbox-background-secondary)',
                        color: 'var(--chatbox-tint-warning)',
                      }}
                    >
                      <ScalableIcon icon={IconAlertCircle} size={14} />
                    </Box>
                    <Text size="xs" lh={1.35} c="chatbox-warning" className="min-w-0">
                      {t(
                        'This attachment is very large and may consume more points. You can send it anyway, or remove it and use a smaller file.'
                      )}
                    </Text>
                  </Flex>
                )}
                {pictureKeys?.map((picKey) => (
                  <ImageMiniCard key={picKey} storageKey={picKey} onDelete={() => onImageDeleteClick(picKey)} />
                ))}
                {attachments?.map((file) => {
                  const fileKey = StorageKeyGenerator.fileUniqKey(file)
                  const status = preConstructedMessage.preprocessingStatus.files[fileKey]
                  const preprocessedFile = preConstructedMessage.preprocessedFiles.find(
                    (f) => StorageKeyGenerator.fileUniqKey(f.file) === fileKey
                  )
                  const effectiveIndexStatus = preprocessedFile?.sessionAttachmentId
                    ? (preprocessedAttachmentIndexStatusMap.get(preprocessedFile.sessionAttachmentId) ??
                      preprocessedFile.sessionAttachmentIndexStatus)
                    : preprocessedFile?.sessionAttachmentIndexStatus
                  const effectiveAttachmentError = preprocessedFile?.sessionAttachmentId
                    ? (preprocessedAttachmentErrorMap.get(preprocessedFile.sessionAttachmentId) ??
                      preprocessedFile?.error)
                    : preprocessedFile?.error
                  const attachmentProgress = preprocessedFile?.sessionAttachmentId
                    ? preprocessedAttachmentProgressMap.get(preprocessedFile.sessionAttachmentId)
                    : undefined
                  const totalChunks =
                    attachmentProgress?.totalChunks ?? preprocessedFile?.sessionAttachmentTotalChunks ?? 0
                  const embeddedChunks =
                    attachmentProgress?.embeddedChunks ?? preprocessedFile?.sessionAttachmentEmbeddedChunks ?? 0
                  const indexingStage =
                    attachmentProgress?.indexingStage ?? preprocessedFile?.sessionAttachmentIndexingStage
                  const progressValue = getSessionAttachmentProgressValue(embeddedChunks, totalChunks)
                  const isSessionAttachmentTakingLong =
                    !!attachmentProgress?.processingStartedAt &&
                    effectiveIndexStatus !== 'ready' &&
                    Date.now() - attachmentProgress.processingStartedAt > 30000
                  const statusText =
                    preprocessedFile?.ragMode === 'session-retrieval' && effectiveIndexStatus !== 'ready'
                      ? progressValue !== undefined
                        ? `${isSessionAttachmentTakingLong ? t('Still indexing') : getSessionAttachmentStageLabel(indexingStage, t)} · ${progressValue}%`
                        : isSessionAttachmentTakingLong
                          ? t('Still indexing')
                          : getSessionAttachmentStageLabel(indexingStage, t)
                      : status === 'processing'
                        ? t('Preparing')
                        : undefined
                  return (
                    <FileMiniCard
                      key={fileKey}
                      name={file.name}
                      fileType={file.type}
                      status={
                        effectiveAttachmentError
                          ? 'error'
                          : preprocessedFile?.ragMode === 'session-retrieval'
                            ? effectiveIndexStatus === 'ready'
                              ? 'completed'
                              : 'processing'
                            : status
                      }
                      statusText={statusText}
                      parserType={preprocessedFile?.parserType}
                      progressValue={progressValue}
                      isTakingLong={isSessionAttachmentTakingLong}
                      errorMessage={effectiveAttachmentError}
                      onErrorClick={() => {
                        const errorCode = effectiveAttachmentError
                        if (errorCode) {
                          void NiceModal.show('file-parse-error', {
                            errorCode,
                            fileName: file.name,
                          })
                        }
                      }}
                      onPreviewClick={
                        preprocessedFile?.storageKey
                          ? () => {
                              const parserLabel = getParserTypeLabel(preprocessedFile?.parserType, t)
                              void NiceModal.show('content-viewer', {
                                title: `${t('File Content')}: ${file.name}`,
                                storageKey: preprocessedFile.storageKey,
                                metadata: parserLabel ? [{ value: parserLabel }] : undefined,
                              })
                            }
                          : undefined
                      }
                      onDelete={() => {
                        const fileKeysToRemove = new Set([fileKey])
                        // Cancel any ongoing MinerU parsing for this file
                        const filePath = platform.getLocalFilePath(file)
                        fileKeysToRemove.add(StorageKeyGenerator.fileUniqKey(file))
                        for (const key of fileKeysToRemove) {
                          activeFilePreprocessingKeysRef.current.delete(key)
                        }
                        if (filePath && platform.cancelMineruParse) {
                          platform.cancelMineruParse(filePath).catch(() => {
                            // Ignore cancellation errors
                          })
                        }
                        if (platform.type === 'desktop' && preprocessedFile?.sessionAttachmentId) {
                          void platform
                            .getSessionAttachmentRagController()
                            .deleteAttachment(preprocessedFile.sessionAttachmentId)
                            .catch(() => {
                              // Ignore cancellation errors
                            })
                        }
                        setPreConstructedMessage((prev) =>
                          cleanupFile(prev, file, { fileKeys: fileKeysToRemove, removeAttachment: true })
                        )
                      }}
                    />
                  )
                })}
              </Flex>
            )}

            {/* Toolbar Row */}
            <Flex align="center" gap={0} className="shrink-0 w-full" justify="space-between">
              {/* Hidden file inputs */}
              <ImageUploadInput
                ref={pictureInputRef}
                onChange={onFileInputChange}
                testId={TestId.chat.attachmentImageInput}
              />
              <input
                data-testid={TestId.chat.attachmentFileInput}
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={onFileInputChange}
                multiple
                accept={isAgentModeActive ? undefined : getFileAcceptString()}
              />

              {/* Left Group: Tool Buttons */}
              <Flex align="center" gap={0}>
                <AttachmentMenu onImageUploadClick={onImageUploadClick} onFileUploadClick={onFileUploadClick} t={t} />

                {/* Desktop owns Web Search in AgentModePanel for both Chat and Work modes.
                    Mobile/Web keep this standalone entry because they do not render that panel. */}
                {platform.type !== 'desktop' && (
                  <Tooltip label={t('Web Search')} position="top" withArrow disabled={isSmallScreen}>
                    <UnstyledButton
                      data-testid={TestId.chat.webSearchToggle}
                      onClick={() => {
                        setWebBrowsingMode(!webBrowsingMode)
                        dom.focusMessageInput()
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                    >
                      <IconWorldWww
                        size={toolbarIconSize}
                        strokeWidth={1.8}
                        className={
                          webBrowsingMode ? 'text-[var(--chatbox-tint-brand)]' : 'text-[var(--chatbox-tint-secondary)]'
                        }
                      />
                    </UnstyledButton>
                  </Tooltip>
                )}

                <ReasoningControlButton
                  provider={model?.provider}
                  model={reasoningModelInfo}
                  providerOptions={effectiveProviderOptions}
                  iconSize={toolbarIconSize}
                  compact={isSmallScreen}
                  onChange={(level) => void handleReasoningLevelChange(level)}
                />

                {platform.type === 'desktop' && (
                  <Tooltip label={t('Screenshot')} position="top" withArrow>
                    <UnstyledButton
                      onClick={() => void window.electronAPI.invoke('capture:start')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                    >
                      <IconCamera
                        size={toolbarIconSize}
                        strokeWidth={1.8}
                        className="text-[var(--chatbox-tint-secondary)]"
                      />
                    </UnstyledButton>
                  </Tooltip>
                )}

                {/* Agent Mode Panel - desktop only */}
                {platform.type === 'desktop' && (
                  <AgentModeButton
                    sessionId={currentSessionId || 'new'}
                    providerId={model?.provider}
                    modelId={model?.modelId}
                    iconSize={toolbarIconSize}
                    compact={isSmallScreen}
                    modelSupportsAgentMode={model ? modelSupportsAgentMode : true}
                    webBrowsingMode={webBrowsingMode}
                    onWebBrowsingChange={(v) => {
                      setWebBrowsingMode(v)
                      dom.focusMessageInput()
                    }}
                    currentKnowledgeBaseId={knowledgeBase?.id}
                    onKnowledgeBaseSelect={handleKnowledgeBaseSelect}
                    onSkillSelect={insertSkillCommand}
                  />
                )}

                {!isSmallScreen &&
                  (showRollbackThreadButton ? (
                    <Tooltip label={t('Rollback Thread')} position="top" withArrow>
                      <UnstyledButton
                        onClick={rollbackThread}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                      >
                        <IconArrowBackUp
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Tooltip>
                  ) : (
                    <Tooltip label={t('New Thread')} position="top" withArrow>
                      <UnstyledButton
                        onClick={startNewThread}
                        disabled={!onStartNewThread}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors disabled:opacity-50"
                      >
                        <IconFilePencil
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Tooltip>
                  ))}

                {!isSmallScreen && (
                  <Tooltip label={t('Conversation Settings')} position="top" withArrow>
                    <UnstyledButton
                      onClick={onClickSessionSettings}
                      disabled={!onClickSessionSettings}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors disabled:opacity-50"
                    >
                      <IconAdjustmentsHorizontal
                        size={toolbarIconSize}
                        strokeWidth={1.8}
                        className="text-[var(--chatbox-tint-secondary)]"
                      />
                    </UnstyledButton>
                  </Tooltip>
                )}

                {/* Mobile: Settings menu */}
                {isSmallScreen && (
                  <Menu
                    trigger="click"
                    openDelay={100}
                    closeDelay={100}
                    keepMounted
                    transitionProps={{
                      transition: 'pop',
                      duration: 200,
                    }}
                  >
                    <Menu.Target>
                      <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
                        <IconSettings
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<ScalableIcon icon={IconPlus} size={16} />} onClick={startNewThread}>
                        {t('New Thread')}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<ScalableIcon icon={IconAdjustmentsHorizontal} size={16} />}
                        onClick={onClickSessionSettings}
                      >
                        {t('Conversation Settings')}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Flex>

              {/* Right Group: Token Count + Model Selector */}
              <Flex align="center" gap={0} className="min-w-0 ml-auto">
                <TokenCountMenu
                  currentInputTokens={currentInputTokens}
                  contextTokens={contextTokens}
                  totalTokens={totalTokens}
                  isCalculating={isCalculating}
                  pendingTasks={pendingTasks}
                  totalContextMessages={messageCount}
                  contextWindow={effectiveContextWindow ?? undefined}
                  currentMessageCount={currentContextMessageIds?.length ?? 0}
                  maxContextMessageCount={currentSessionMergedSettings?.maxContextMessageCount}
                  onCompressClick={sessionId && !isNewSession ? () => setShowCompressionModal(true) : undefined}
                  autoCompactionEnabled={autoCompactionEnabled}
                  isCompacting={isCompacting}
                  contextWindowKnown={contextWindowKnown}
                  onAutoCompactionChange={sessionId && !isNewSession ? handleAutoCompactionChange : undefined}
                >
                  <Flex
                    align="center"
                    gap="2"
                    className={`shrink-0 text-xs cursor-pointer hover:text-chatbox-tint-secondary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] ${
                      tokenPercentage && tokenPercentage > 80 ? 'text-red-500' : 'text-chatbox-tint-tertiary'
                    }`}
                  >
                    <ScalableIcon icon={IconArrowUp} size={14} />
                    {isCalculating && <Loader size={10} />}
                    <Text span size="xs" className="whitespace-nowrap" c="inherit">
                      {isCalculating ? '~' : ''}
                      {formatNumber(totalTokens)}
                      {tokenPercentage !== null && tokenPercentage > 10 && ` (${tokenPercentage}%)`}
                    </Text>
                  </Flex>
                </TokenCountMenu>

                {/* Model Selector */}
                <Box className="min-w-0 flex-1 justify-end max-w-[200px]">
                  <ModelSelectorV2
                    onSelect={onSelectModel}
                    selectedProviderId={model?.provider}
                    selectedModelId={model?.modelId}
                    modelDisabledCheck={modelDisabledCheck}
                    pageName={JK_PAGE_NAMES.CHAT_PAGE}
                    position="top-end"
                    transitionProps={{
                      transition: 'fade-up',
                      duration: 200,
                    }}
                  >
                    <UnstyledButton
                      className={cn(
                        'flex min-w-0 max-w-full items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors',
                        !model && 'animate-pulse bg-blue-500/20'
                      )}
                    >
                      {!!model && <ProviderImageIcon size={18} provider={model.provider} />}
                      <Text
                        size="sm"
                        data-testid={TestId.model.selectorTrigger}
                        className={cn(
                          'min-w-0 flex-1 truncate text-[var(--chatbox-tint-secondary)]',
                          isSmallScreen ? 'max-w-[100px]' : 'max-w-[160px]'
                        )}
                      >
                        {modelSelectorDisplayText}
                      </Text>
                      <IconChevronRight
                        size={14}
                        className="text-[var(--chatbox-tint-tertiary)] rotate-90 flex-shrink-0"
                      />
                    </UnstyledButton>
                  </ModelSelectorV2>
                </Box>
              </Flex>
            </Flex>
          </Box>

          <Disclaimer />
        </Stack>
        {currentSession && (
          <CompressionModal
            opened={showCompressionModal}
            onClose={() => setShowCompressionModal(false)}
            session={currentSession}
          />
        )}
        <AdaptiveModal
          opened={unreadyAttachmentSubmitPrompt.opened}
          onClose={() => setUnreadyAttachmentSubmitPrompt((prev) => ({ ...prev, opened: false }))}
          title={t('Document is still indexing')}
          centered
          size="sm"
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {t(
                '{{count}} document(s) are still being prepared. If you send now, the answer may not use the full document.',
                { count: unreadyAttachmentSubmitPrompt.count }
              )}
            </Text>
            <AdaptiveModal.Actions>
              <Button
                variant="default"
                onClick={() => setUnreadyAttachmentSubmitPrompt((prev) => ({ ...prev, opened: false }))}
              >
                {t('Wait')}
              </Button>
              <Button
                onClick={() => {
                  setUnreadyAttachmentSubmitPrompt((prev) => ({ ...prev, opened: false }))
                  void handleSubmit(true, { allowUnreadySessionAttachments: true })
                }}
              >
                {t('Send anyway')}
              </Button>
            </AdaptiveModal.Actions>
          </Stack>
        </AdaptiveModal>
      </Box>
    )
  }
)

// Reusable attachment menu component with lightweight style
const AttachmentMenu: React.FC<{
  onImageUploadClick: () => void
  onFileUploadClick: () => void
  t: (key: string) => string
}> = ({ onImageUploadClick, onFileUploadClick, t }) => {
  const isSmallScreen = useIsSmallScreen()
  const toolbarIconSize = isSmallScreen ? 22 : 18
  return (
    <Menu
      shadow="md"
      trigger={isSmallScreen ? 'click' : 'hover'}
      position="top-start"
      openDelay={100}
      closeDelay={100}
      keepMounted
      transitionProps={{
        transition: 'pop',
        duration: 200,
      }}
    >
      <Menu.Target>
        <UnstyledButton
          data-testid={TestId.chat.attachmentMenuTrigger}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
        >
          <IconCirclePlus size={toolbarIconSize} strokeWidth={1.8} className="text-[var(--chatbox-tint-secondary)]" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          data-testid={TestId.chat.attachmentSelectImage}
          leftSection={<IconPhoto size={16} />}
          onClick={onImageUploadClick}
        >
          {t('Attach Image')}
        </Menu.Item>
        <Menu.Item
          data-testid={TestId.chat.attachmentSelectFile}
          leftSection={<IconFolder size={16} />}
          onClick={onFileUploadClick}
        >
          {t('Select File')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

// Memoize the InputBox component to prevent unnecessary re-renders during streaming
export default memo(InputBox)
