import { buildContext } from '@shared/context'
import { OCRError } from '@shared/models/errors'
import type { ChatStreamOptions, ModelInterface } from '@shared/models/types'
import type { SandboxProvider } from '@shared/sandbox-provider'
import type {
  AgentModeLockReason,
  AgentModeValue,
  CompactionPoint,
  Config,
  KnowledgeBase,
  Message,
  MessageContentParts,
  Session,
  SessionSettings,
  Settings,
} from '@shared/types'
import { ModelProviderEnum } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { sequenceMessages } from '@shared/utils/message'
import type { ToolSet } from 'ai'
import { t } from 'i18next'
import { getLogger } from '@/lib/utils'
import { convertToModelMessages, injectModelSystemPrompt } from '@/packages/model-calls/message-utils'
import platform from '@/platform'
import { createSandboxProvider } from '@/sandbox'
import { SESSION_ATTACHMENT_RAG_LOG_PREFIX } from '../../../shared/session-attachment-rag/logging'
import { createAttachmentResolver } from './attachment-resolver'
import { applyLegacyToolFallback } from './legacy-tool-fallback'
import { getOCRModel, ocrImagesInMessages } from './ocr-helper'
import { buildToolsForSession } from './tools-builder'

const log = getLogger('agent-generation-harness')
const RECENT_TOOL_CALL_CACHE_WINDOW_MS = 5 * 60 * 1000

const GLOBAL_RESPONSE_LANGUAGE_INSTRUCTION = `
## Response Language
Unless the user requests otherwise, all visible assistant text must be in the same language as the user's latest message.
`

export interface AgentGenerationSideEffects {
  lockAgentMode?: (reason: Exclude<AgentModeLockReason, null>) => void
}

export interface PrepareAgentGenerationHarnessOptions {
  session: Session
  settings: SessionSettings
  globalSettings: Settings
  configs: Config
  messages: Message[]
  targetMsgIx: number
  model: ModelInterface
  dependencies: ModelDependencies
  knowledgeBase?: Pick<KnowledgeBase, 'id' | 'name'>
  webBrowsing: boolean
  agentModeValue: AgentModeValue
  agentModeLocked: boolean
  agentModeSupported: boolean
  signal: AbortSignal
  providerOptions?: SessionSettings['providerOptions']
  /**
   * Points of the conversation being generated (thread-level when the target
   * message lives in an archived thread). Defaults to session.compactionPoints.
   */
  compactionPoints?: CompactionPoint[]
  preserveLastPromptMessageToolCalls?: boolean
  sideEffects?: AgentGenerationSideEffects
  sandboxProviderFactory?: () => SandboxProvider | null
  isPro?: () => boolean
}

export interface PreparedAgentGenerationHarness {
  promptMsgs: Message[]
  coreMessages: Awaited<ReturnType<typeof convertToModelMessages>>
  tools: ToolSet
  chatOptions: ChatStreamOptions
  infoParts: MessageContentParts
  fallbackToolCallPart: MessageContentParts[number] | undefined
  sandboxProvider: SandboxProvider | null
  debug: {
    effectiveAgentMode: 'on' | 'off'
    canExecuteCode: boolean
    toolNames: string[]
    instructions: string
  }
}

export function computeEffectiveAgentMode(agentModeValue: AgentModeValue, agentModeSupported: boolean): 'on' | 'off' {
  if (!agentModeSupported || agentModeValue === 'off') return 'off'
  return agentModeValue === 'on' ? 'on' : 'off'
}

function getToolCallPreserveMessageIds(
  messages: Message[],
  targetMsgIx: number,
  preserveLastPromptMessageToolCalls: boolean
): string[] {
  const ids = new Set<string>()
  const targetMessage = messages[targetMsgIx]
  const previousMessage = messages[targetMsgIx - 1]

  if (preserveLastPromptMessageToolCalls && previousMessage) {
    ids.add(previousMessage.id)
  }

  if (targetMessage?.timestamp !== undefined && previousMessage?.timestamp !== undefined) {
    const interval = targetMessage.timestamp - previousMessage.timestamp
    if (interval >= 0 && interval <= RECENT_TOOL_CALL_CACHE_WINDOW_MS) {
      ids.add(previousMessage.id)
    }
  }

  return [...ids]
}

export async function refreshSessionAttachmentStatuses(messages: Message[]): Promise<Message[]> {
  if (platform.type !== 'desktop') {
    return messages
  }

  const ids = Array.from(
    new Set(
      messages.flatMap((message) =>
        (message.files ?? [])
          .filter((file) => file.sessionAttachmentId)
          .map((file) => file.sessionAttachmentId as number)
      )
    )
  )

  if (ids.length === 0) {
    return messages
  }

  const controller = platform.getSessionAttachmentRagController()
  const attachments = await controller.getAttachments(ids)
  log.debug(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} Refreshed attachment statuses: count=${attachments.length}, statuses=${attachments
      .map((attachment) => `${attachment.id}:${attachment.indexStatus ?? attachment.status}`)
      .join(',')}`
  )
  const availabilityMap = new Map(attachments.map((attachment) => [attachment.id, attachment.availability]))
  const indexStatusMap = new Map(attachments.map((attachment) => [attachment.id, attachment.indexStatus]))
  const chunkCountMap = new Map(attachments.map((attachment) => [attachment.id, attachment.chunkCount]))
  const totalChunksMap = new Map(attachments.map((attachment) => [attachment.id, attachment.totalChunks]))
  const embeddedChunksMap = new Map(attachments.map((attachment) => [attachment.id, attachment.embeddedChunks]))
  const indexingStageMap = new Map(attachments.map((attachment) => [attachment.id, attachment.indexingStage]))

  return messages.map((message) => {
    if (!message.files?.length) {
      return message
    }

    const files = message.files.map((file) => {
      if (!file.sessionAttachmentId) {
        return file
      }
      return {
        ...file,
        sessionAttachmentAvailability:
          availabilityMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentAvailability,
        sessionAttachmentIndexStatus: indexStatusMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentIndexStatus,
        sessionAttachmentStatus: indexStatusMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentStatus,
        sessionAttachmentChunkCount: chunkCountMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentChunkCount,
        sessionAttachmentTotalChunks: totalChunksMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentTotalChunks,
        sessionAttachmentEmbeddedChunks:
          embeddedChunksMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentEmbeddedChunks,
        sessionAttachmentIndexingStage:
          indexingStageMap.get(file.sessionAttachmentId) ?? file.sessionAttachmentIndexingStage,
      }
    })

    return { ...message, files }
  })
}

export async function prepareAgentGenerationHarness(
  options: PrepareAgentGenerationHarnessOptions
): Promise<PreparedAgentGenerationHarness> {
  const {
    session,
    settings,
    globalSettings,
    configs,
    messages,
    targetMsgIx,
    model,
    dependencies,
    knowledgeBase,
    webBrowsing,
    agentModeValue,
    agentModeLocked,
    agentModeSupported,
    signal,
    providerOptions,
    compactionPoints = session.compactionPoints,
    preserveLastPromptMessageToolCalls = false,
    sideEffects,
    sandboxProviderFactory = createSandboxProvider,
    isPro = () => true,
  } = options

  const allMessages = messages.slice(0, targetMsgIx)
  const resumedMessage = preserveLastPromptMessageToolCalls ? messages[targetMsgIx - 1] : undefined

  if (agentModeSupported && agentModeValue === 'on' && !agentModeLocked) {
    sideEffects?.lockAgentMode?.('message_sent')
  }

  const effectiveAgentMode = computeEffectiveAgentMode(agentModeValue, agentModeSupported)
  const sandboxProvider = effectiveAgentMode !== 'off' ? sandboxProviderFactory() : null
  // Grant the sandbox read/write access to any user-bound working directories before it
  // initializes lazily on the first tool call (desktop only; cloud provider no-ops).
  const userWorkingDirectories = settings.workingDirectories?.filter((dir) => dir.trim().length > 0) ?? []
  if (sandboxProvider && userWorkingDirectories.length > 0) {
    sandboxProvider.setExtraWritableDirs(userWorkingDirectories)
  }
  let canExecuteCode = Boolean(sandboxProvider && model.isSupportToolUse('agent'))

  if (canExecuteCode && sandboxProvider?.type === 'cloud' && !isPro()) {
    canExecuteCode = false
  }

  if (canExecuteCode && sandboxProvider) {
    const availability = await sandboxProvider.checkAvailability()
    if (!availability.available) {
      canExecuteCode = false
    }
  }

  const attachmentResolver = createAttachmentResolver()
  const messagesForPrompt = (await refreshSessionAttachmentStatuses(messages.slice(0, targetMsgIx))).map((message) =>
    // A resumed continuation keeps its target message flagged `generating` for the UI,
    // but its tool calls/results are exactly the context the follow-up request must
    // continue from — without this the eligibility filter drops the whole message and
    // the model restarts the task from scratch.
    message.id === resumedMessage?.id && message.generating ? { ...message, generating: false } : message
  )
  const preserveToolCallMessageIds = getToolCallPreserveMessageIds(
    messages,
    targetMsgIx,
    preserveLastPromptMessageToolCalls
  )
  let promptMsgs = await buildContext(messagesForPrompt, {
    attachmentResolver,
    compactionPoints,
    modelSupportToolUseForFile: model.isSupportToolUse('read-file'),
    maxContextMessageCount: settings.maxContextMessageCount,
    preserveToolCallMessageIds,
    sandboxMode: canExecuteCode,
  })

  const infoParts: MessageContentParts = []

  if (
    !model.isSupportVision() &&
    promptMsgs.some((message) => message.contentParts.some((part) => part.type === 'image' && !part.ocrResult))
  ) {
    const ocrResult = getOCRModel(globalSettings, configs, dependencies)
    if (!ocrResult) {
      throw new Error(
        'The current model does not support image input, and no OCR model is configured. Please configure an OCR model or switch to a vision-capable model.'
      )
    }
    try {
      await ocrImagesInMessages(promptMsgs, ocrResult.model)
    } catch (err) {
      throw new OCRError(ocrResult.providerName, err instanceof Error ? err : new Error(`${err}`))
    }
    infoParts.push({
      type: 'info',
      text: t('Current model {{modelName}} does not support image input, using OCR to process images', {
        modelName: model.modelId,
      }),
    })
  }

  const { promptMsgs: updatedMsgs, fallbackToolCallPart } = await applyLegacyToolFallback({
    model,
    promptMsgs,
    knowledgeBase,
    webBrowsing,
    signal,
  })
  promptMsgs = updatedMsgs

  const codeExecutionOption =
    canExecuteCode && sandboxProvider
      ? {
          sessionId: session.id,
          provider: sandboxProvider,
          files: allMessages.flatMap(
            (message) =>
              message.files?.map((file) => ({
                storageKey: file.storageKey || '',
                rawStorageKey: file.rawStorageKey,
                name: file.name,
              })) || []
          ),
        }
      : undefined

  const { tools, instructions: toolInstructions } = await buildToolsForSession(model, {
    sessionId: session.id,
    webBrowsing,
    knowledgeBase,
    messages: promptMsgs,
    agentMode: effectiveAgentMode,
    sessionSettings: settings,
    codeExecution: codeExecutionOption,
    onAgentModeActivated: () => {
      sideEffects?.lockAgentMode?.('load_skill')
    },
  })
  const hasTools = Object.keys(tools).length > 0
  const instructions = hasTools ? `${GLOBAL_RESPONSE_LANGUAGE_INSTRUCTION}${toolInstructions}` : toolInstructions

  let injectedMessages = injectModelSystemPrompt(
    model.modelId,
    promptMsgs,
    instructions,
    model.isSupportSystemMessage() ? 'system' : 'user'
  )

  if (!model.isSupportSystemMessage()) {
    injectedMessages = injectedMessages.map((message) => ({
      ...message,
      role: message.role === 'system' ? 'user' : message.role,
    }))
  }

  injectedMessages = sequenceMessages(injectedMessages)

  const coreMessages = await convertToModelMessages(injectedMessages, {
    modelSupportVision: model.isSupportVision(),
    preserveReasoning: settings.provider === ModelProviderEnum.DeepSeek,
    // getModel() stamps apiStyle from the provider type (builtin/custom Gemini providers),
    // so it is the single signal for "this request speaks the Gemini function-call protocol".
    ensureGoogleFunctionCallSignatures: model.apiStyle === 'google',
  })

  const chatOptions: ChatStreamOptions = {
    sessionId: session.id,
    agentMode: effectiveAgentMode === 'on',
    signal,
    providerOptions,
  }

  if (Object.keys(tools).length > 0) {
    chatOptions.tools = tools as ToolSet
  }

  return {
    promptMsgs,
    coreMessages,
    tools,
    chatOptions,
    infoParts,
    fallbackToolCallPart,
    sandboxProvider,
    debug: {
      effectiveAgentMode,
      canExecuteCode,
      toolNames: Object.keys(tools),
      instructions,
    },
  }
}
