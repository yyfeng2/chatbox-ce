import { isExpectedGenerationError } from '@shared/models/error-classification'
import { ApiError, BaseError, NetworkError, OCRError } from '@shared/models/errors'
import { findMessageContext, findMessageSourceThread } from '@shared/session/message-forks'
import type {
  AgentModeValue,
  CompactionPoint,
  Message,
  ModelProvider,
  Session,
  SessionSettings,
  SessionType,
  Settings,
} from '@shared/types'
import { identity, pickBy } from 'lodash'
import {
  type AgentModeEntrySource,
  bucketCount,
  captureAgentModeException,
  toBooleanString,
} from '@/analytics/agent-mode'
import { getModelDisplayName } from '@/packages/model-setting-utils'
import platform from '@/platform'
import { reportError } from '@/utils/sentry'
import { trackEvent } from '@/utils/track'
import { uiStore } from '../uiStore'
import { getSessionAgentModeEntry } from './agent-mode'

/**
 * Get session-level web browsing setting
 * Returns user's explicit setting if set, otherwise returns default based on provider
 */
export function getSessionWebBrowsing(sessionId: string, provider: string | undefined): boolean {
  const sessionValue = uiStore.getState().sessionWebBrowsingMap[sessionId]
  if (sessionValue !== undefined) {
    return sessionValue
  }
  return false
}

/**
 * Track generation event.
 * Runs in the message-send critical path, so it must never throw.
 */
export function trackGenerateEvent(
  sessionId: string,
  settings: SessionSettings,
  globalSettings: Settings,
  sessionType: SessionType | undefined,
  options?: { operationType?: 'send_message' | 'regenerate'; agentModeEntrySource?: AgentModeEntrySource }
) {
  try {
    let providerIdentifier: ModelProvider = settings.provider || 'unknown'
    if (settings.provider?.startsWith('custom-provider-')) {
      const providerSettings = globalSettings.providers?.[settings.provider]
      if (providerSettings?.apiHost) {
        try {
          const url = new URL(providerSettings.apiHost)
          providerIdentifier = `custom:${url.hostname}`
        } catch {
          providerIdentifier = `custom:${providerSettings.apiHost}`
        }
      } else {
        providerIdentifier = 'custom:unknown'
      }
    }

    const webBrowsing = getSessionWebBrowsing(sessionId, settings.provider)
    const agentModeEntry = getSessionAgentModeEntry(sessionId, { settings })
    const agentModeActive = platform.type === 'desktop' && agentModeEntry.value === 'on'
    const agentModeEntrySource: AgentModeEntrySource =
      options?.agentModeEntrySource ??
      (agentModeActive ? (agentModeEntry.locked ? 'locked_session' : 'manual') : 'none')
    const sessionKnowledgeBaseMap = uiStore.getState().sessionKnowledgeBaseMap
    const knowledgeBaseEnabled = Boolean(sessionKnowledgeBaseMap[sessionId])
    const enabledMcpCount =
      (globalSettings.mcp?.servers?.filter((server) => server.enabled).length ?? 0) +
      (globalSettings.mcp?.enabledBuiltinServers?.length ?? 0)
    const enabledSkillCount = globalSettings.skills?.enabledSkillNames?.length ?? 0
    const workingDirectoryCount = settings.workingDirectories?.filter((dir) => dir.trim().length > 0).length ?? 0

    trackEvent('generate', {
      provider: providerIdentifier,
      model: settings.modelId || 'unknown',
      operation_type: options?.operationType || 'unknown',
      web_browsing_enabled: webBrowsing ? 'true' : 'false',
      session_type: sessionType || 'chat',
      agent_mode: agentModeEntry.value,
      agent_mode_active: toBooleanString(agentModeActive),
      agent_mode_entry_source: agentModeEntrySource,
      agent_full_access_enabled: toBooleanString(settings.agentFullAccess === true),
      has_knowledge_base: toBooleanString(knowledgeBaseEnabled),
      enabled_mcp_count: bucketCount(enabledMcpCount),
      enabled_skill_count: bucketCount(enabledSkillCount),
      working_directory_count: bucketCount(workingDirectoryCount),
    })
  } catch (error) {
    console.warn('trackGenerateEvent failed:', error)
  }
}

/**
 * Find target message index in session messages or threads
 * @returns Object with messages array and index, or null if not found
 */
export function findTargetMessageIndex(
  session: Session,
  targetMsgId: string
): { messages: Message[]; index: number } | null {
  const location = findMessageContext(session, targetMsgId)
  return location && location.index > 0 ? { messages: location.list, index: location.index } : null
}

/**
 * Compaction points applicable to a target message's conversation: thread
 * points when the message lives in an archived thread (retry from history),
 * session points otherwise. Points are stored next to their message list
 * (see buildCompactionCommitPatch / thread archive flows).
 */
export function getCompactionPointsForTarget(session: Session, targetMsgId: string): CompactionPoint[] | undefined {
  const sourceThread = findMessageSourceThread(session, targetMsgId)
  return sourceThread ? sourceThread.compactionPoints : session.compactionPoints
}

/**
 * Initialize target message with generating state
 */
export async function initializeTargetMessage(
  targetMsg: Message,
  settings: SessionSettings,
  globalSettings: Settings,
  sessionType: SessionType | undefined
): Promise<Message> {
  return {
    ...targetMsg,
    cancel: undefined,
    aiProvider: settings.provider,
    model: await getModelDisplayName(settings, globalSettings, sessionType || 'chat'),
    generating: true,
    errorCode: undefined,
    error: undefined,
    errorExtra: undefined,
    status: [],
    firstTokenLatency: undefined,
    isStreamingMode: settings.stream !== false,
  }
}

/**
 * Handle generation error and return updated message with error info
 */
export function handleGenerationError(
  err: unknown,
  targetMsg: Message,
  settings: SessionSettings,
  sentryContext?: { operationType?: 'send_message' | 'regenerate'; agentMode?: AgentModeValue }
): Message {
  const error = !(err instanceof Error) ? new Error(`${err}`) : err
  if (!isExpectedGenerationError(error)) {
    if (sentryContext?.agentMode === 'on') {
      captureAgentModeException(error, {
        operation: 'generation',
        provider: settings.provider,
        model: settings.modelId,
        agentMode: sentryContext.agentMode,
        fullAccess: settings.agentFullAccess === true,
        operationType: sentryContext.operationType,
      })
    } else {
      reportError(error, {
        domain: 'ai-generation',
        operation: sentryContext?.operationType ?? 'generation',
        priority: 'high',
        tags: settings.provider
          ? {
              provider: settings.provider.startsWith('custom-provider-') ? 'custom' : settings.provider,
            }
          : undefined,
      })
    }
  }

  let errorCode: number | undefined
  if (err instanceof BaseError) {
    errorCode = err.code
  }

  const ocrError = error instanceof OCRError ? error : undefined
  const causeError = ocrError?.cause

  return {
    ...targetMsg,
    generating: false,
    cancel: undefined,
    errorCode,
    error: `${error.message}`,
    errorExtra: pickBy(
      {
        aiProvider: ocrError ? ocrError.ocrProvider : settings.provider,
        causeErrorCode: causeError instanceof BaseError ? causeError.code : undefined,
        host:
          error instanceof NetworkError ? error.host : causeError instanceof NetworkError ? causeError.host : undefined,
        responseBody:
          error instanceof ApiError
            ? error.responseBody
            : causeError instanceof ApiError
              ? causeError.responseBody
              : undefined,
        httpStatusCode:
          error instanceof ApiError
            ? error.statusCode
            : causeError instanceof ApiError
              ? causeError.statusCode
              : undefined,
        requestId:
          error instanceof BaseError
            ? error.requestId
            : causeError instanceof BaseError
              ? causeError.requestId
              : undefined,
      },
      identity
    ),
    status: [],
  }
}
