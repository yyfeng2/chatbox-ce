import type { CompactionPoint, SessionSettings, Settings } from '@shared/types'
import { createMessage } from '@shared/types'
import { getTokenizerType } from '@/packages/token-estimation'
import { setCompactionUIState } from '@/stores/atoms/compactionAtoms'
import * as chatStore from '@/stores/chatStore'
import queryClient from '@/stores/queryClient'
import { settingsStore } from '@/stores/settingsStore'
import { sumCachedTokensFromMessages } from '../token'
import { findLastCompactionBoundaryMessage } from './compaction-boundary'
import { buildCompactionCommitPatch } from './compaction-commit'
import { checkOverflow } from './compaction-detector'
import {
  type ContextTokensCacheValue,
  getContextMessagesForTokenEstimation,
  getContextTokensCacheKey,
  getLatestCompactionBoundaryId,
} from './context-tokens'
import { generateSummaryWithStream } from './summary-generator'

function getModelContextWindowFromSettings(
  providerId: string | undefined,
  modelId: string | undefined,
  settings: Settings
): number | undefined {
  if (!providerId || !modelId) return undefined
  const providerSettings = settings.providers?.[providerId]
  const model = providerSettings?.models?.find((m) => m.modelId === modelId)
  return model?.contextWindow
}

const ongoingCompactions = new Set<string>()

export interface CompactionOptions {
  force?: boolean
}

export interface CompactionResult {
  success: boolean
  compacted: boolean
  error?: Error
  summaryMessageId?: string
  /** Another compaction for this session was already streaming; nothing was done. */
  alreadyRunning?: boolean
}

export function isAutoCompactionEnabled(sessionSettings?: SessionSettings, globalSettings?: Settings): boolean {
  if (sessionSettings?.autoCompaction !== undefined) {
    return sessionSettings.autoCompaction
  }
  return globalSettings?.autoCompaction ?? true
}

export function isCompactionInProgress(sessionId: string): boolean {
  return ongoingCompactions.has(sessionId)
}

export async function needsCompaction(sessionId: string): Promise<boolean> {
  // ===== Keep existing early returns (do not modify) =====
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return false
  }

  const globalSettings = settingsStore.getState().getSettings()

  if (!isAutoCompactionEnabled(session.settings, globalSettings)) {
    return false
  }

  const providerId = session.settings?.provider ?? globalSettings.defaultChatModel?.provider
  const modelId = session.settings?.modelId ?? globalSettings.defaultChatModel?.model
  if (!modelId) {
    return false
  }

  // ===== NEW: Get merged settings =====
  const mergedSettings = await chatStore.getSessionSettings(sessionId)
  const maxContextMessageCount = mergedSettings.maxContextMessageCount ?? Number.MAX_SAFE_INTEGER

  // ===== NEW: Construct cache key =====
  const contextMessages = getContextMessagesForTokenEstimation(session, { settings: mergedSettings })
  const model = providerId && modelId ? { provider: providerId, modelId } : undefined
  const tokenizerType = getTokenizerType(model)

  const cacheKey = getContextTokensCacheKey({
    sessionId,
    maxContextMessageCount,
    latestContextMessageId: contextMessages[contextMessages.length - 1]?.id ?? null,
    latestCompactionBoundaryId: getLatestCompactionBoundaryId(session.compactionPoints),
    tokenizerType,
  })

  // ===== NEW: Read from cache =====
  const cachedResult = queryClient.getQueryData<ContextTokensCacheValue>(cacheKey)
  if (!cachedResult) {
    // L2 cache miss: Use L1 cache aggregation (do NOT trigger calculation tasks)
    // In sandbox mode (files + tool-use model), only file metadata is sent, not content
    const hasFiles = contextMessages.some((m) => m.files?.length)
    const sandboxMode = hasFiles // conservative: assume sandbox when files exist
    const estimatedTokens = sumCachedTokensFromMessages(contextMessages, undefined, sandboxMode)
    queryClient.setQueryData(cacheKey, {
      contextTokens: estimatedTokens,
      messageCount: contextMessages.length,
      timestamp: Date.now(),
    })
    const contextWindow = getModelContextWindowFromSettings(providerId, modelId, globalSettings)
    return checkOverflow({
      tokens: estimatedTokens,
      modelId,
      settings: { compactionThreshold: globalSettings.compactionThreshold },
      contextWindow,
    }).isOverflow
  }

  // ===== Keep existing: checkOverflow call (only replace tokens source) =====
  const contextWindow = getModelContextWindowFromSettings(providerId, modelId, globalSettings)
  const overflowResult = checkOverflow({
    tokens: cachedResult.contextTokens, // ← Changed: from cache
    modelId,
    settings: { compactionThreshold: globalSettings.compactionThreshold },
    contextWindow,
  })

  return overflowResult.isOverflow
}

export async function runCompactionWithUIState(
  sessionId: string,
  options: CompactionOptions = {}
): Promise<CompactionResult> {
  // A duplicate request (e.g. manual Compress confirmed while auto-compaction
  // streams) must not touch the UI state: resetting it to idle would unlock
  // fork switching while the owning run is still streaming.
  if (isCompactionInProgress(sessionId)) {
    return { success: true, compacted: false, alreadyRunning: true }
  }

  if (!options.force) {
    const shouldCompact = await needsCompaction(sessionId)
    if (!shouldCompact) {
      return { success: true, compacted: false }
    }
  }

  setCompactionUIState(sessionId, { status: 'running', error: null, streamingText: '' })

  const result = await runCompactionWithStreaming(sessionId)

  if (result.alreadyRunning) {
    // Lost a race with a concurrent run: leave the UI state to its owner.
    return result
  }

  if (result.success) {
    setCompactionUIState(sessionId, { status: 'idle', error: null, streamingText: '' })
  } else {
    setCompactionUIState(sessionId, {
      status: 'failed',
      error: result.error?.message ?? 'Compaction failed',
      streamingText: '',
    })
  }

  return result
}

async function runCompactionWithStreaming(sessionId: string): Promise<CompactionResult> {
  if (ongoingCompactions.has(sessionId)) {
    return { success: true, compacted: false, alreadyRunning: true }
  }

  ongoingCompactions.add(sessionId)

  try {
    const session = await chatStore.getSession(sessionId)
    if (!session) {
      return { success: false, compacted: false, error: new Error('Session not found') }
    }

    const globalSettings = settingsStore.getState().getSettings()

    const modelId = session.settings?.modelId ?? globalSettings.defaultChatModel?.model
    if (!modelId) {
      return { success: true, compacted: false }
    }

    // Apply maxContextMessageCount to summary input
    const mergedSettings = await chatStore.getSessionSettings(sessionId)
    const maxContextMessageCount = mergedSettings.maxContextMessageCount ?? Number.MAX_SAFE_INTEGER
    const currentContext = getContextMessagesForTokenEstimation(session, { settings: mergedSettings })

    const summaryResult = await generateSummaryWithStream({
      messages: currentContext,
      sessionSettings: session.settings,
      onStreamUpdate: (text) => {
        setCompactionUIState(sessionId, { streamingText: text })
      },
    })

    if (!summaryResult.success || !summaryResult.summary) {
      return {
        success: false,
        compacted: false,
        error: summaryResult.error ?? new Error('Failed to generate summary'),
      }
    }

    const summaryMessage = createMessage('assistant', summaryResult.summary)
    summaryMessage.isSummary = true

    const boundaryMessage = findLastCompactionBoundaryMessage(session.messages)
    if (!boundaryMessage) {
      return { success: false, compacted: false, error: new Error('No messages to compact') }
    }

    const newCompactionPoint: CompactionPoint = {
      summaryMessageId: summaryMessage.id,
      boundaryMessageId: boundaryMessage.id,
      createdAt: Date.now(),
    }

    // Summary generation streamed for a while; the session may have changed
    // (fork switch, thread archive, message deletion). Committing is decided
    // against the session state inside the atomic update, not the snapshot.
    let committed = false
    await chatStore.updateSessionWithMessages(sessionId, (currentSession) => {
      if (!currentSession) {
        throw new Error('Session not found during update')
      }

      const patch = buildCompactionCommitPatch(currentSession, summaryMessage, newCompactionPoint)
      if (!patch) {
        return currentSession
      }

      committed = true
      return patch
    })

    if (!committed) {
      // The boundary message was deleted while the summary streamed. The
      // summary describes a conversation that no longer exists, so drop it.
      // Not an error: sending proceeds with the uncompacted context and the
      // next attempt re-compacts against the current messages.
      console.warn('[compaction] boundary message disappeared during summary streaming; compaction abandoned')
      return { success: true, compacted: false }
    }

    return {
      success: true,
      compacted: true,
      summaryMessageId: summaryMessage.id,
    }
  } catch (error) {
    return {
      success: false,
      compacted: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  } finally {
    ongoingCompactions.delete(sessionId)
  }
}
