import { buildContext } from '@shared/context'
import type { AttachmentResolver } from '@shared/context/types'
import { findMessageContext } from '@shared/session/message-forks'
import { type CompactionPoint, createMessage, type Message, type SessionSettings } from '@shared/types'
import type { AgentModeEntrySource } from '@/analytics/agent-mode'
import * as chatStore from '../chatStore'
import { createAttachmentResolver } from './attachment-resolver'
import { createInactiveFork, createNewFork, findMessageLocation } from './forks'
import { withSessionGenerationLock } from './generation-lock'
import { insertMessageAfter } from './messages'
import { orchestrateGeneration } from './orchestration'
import { orchestratePictureGeneration } from './pictures'

/** Internal generation entry point for callers that already hold the session generation lock. */
export async function _generateWithoutSessionLock(
  sessionId: string,
  targetMsg: Message,
  options?: {
    operationType?: 'send_message' | 'regenerate'
    skipAgentModeSuggestion?: boolean
    agentModeEntrySource?: AgentModeEntrySource
    contextMessages?: Message[]
  }
) {
  const session = await chatStore.getSession(sessionId)
  const settings = await chatStore.getSessionSettings(sessionId)
  if (!session || !settings) {
    return
  }

  if (session.type === 'chat' || session.type === undefined) {
    await orchestrateGeneration(sessionId, targetMsg, options)
    return
  }

  await orchestratePictureGeneration(sessionId, targetMsg, session, settings, options)
}

export function generate(
  sessionId: string,
  targetMsg: Message,
  options?: {
    operationType?: 'send_message' | 'regenerate'
    skipAgentModeSuggestion?: boolean
    agentModeEntrySource?: AgentModeEntrySource
  }
) {
  return withSessionGenerationLock(sessionId, () => _generateWithoutSessionLock(sessionId, targetMsg, options))
}

/**
 * Insert and generate a new message below the target message
 * @param sessionId Session ID
 * @param msgId Message ID
 */
async function generateActiveReplyWithoutSessionLock(sessionId: string, msgId: string) {
  const newAssistantMsg = createMessage('assistant', '')
  newAssistantMsg.generating = true // prevent estimating token count before generating done
  await insertMessageAfter(sessionId, newAssistantMsg, msgId)
  await _generateWithoutSessionLock(sessionId, newAssistantMsg, { operationType: 'regenerate' })
}

async function generateInactiveReply(sessionId: string, msgId: string) {
  const newAssistantMsg = createMessage('assistant', '')
  newAssistantMsg.generating = true
  const contextMessages = await createInactiveFork(sessionId, msgId, [newAssistantMsg])

  if (!contextMessages) {
    await insertMessageAfter(sessionId, newAssistantMsg, msgId)
    await _generateWithoutSessionLock(sessionId, newAssistantMsg, { operationType: 'regenerate' })
    return
  }

  await _generateWithoutSessionLock(sessionId, newAssistantMsg, {
    operationType: 'regenerate',
    contextMessages,
  })
}

export async function generateMore(sessionId: string, msgId: string) {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return
  }

  // Picture generation has no abort signal yet, so keep it serialized. Chat
  // replies are safe to run concurrently because their message writes are
  // serialized by chatStore and each stream has its own AbortController.
  if (session.type === 'picture') {
    return withSessionGenerationLock(sessionId, () => generateActiveReplyWithoutSessionLock(sessionId, msgId))
  }
  return generateInactiveReply(sessionId, msgId)
}

export function generateMoreInNewFork(sessionId: string, msgId: string) {
  return withSessionGenerationLock(sessionId, async () => {
    await createNewFork(sessionId, msgId)
    await generateActiveReplyWithoutSessionLock(sessionId, msgId)
  })
}

type GenerateMoreFn = (sessionId: string, msgId: string) => Promise<void>

export function regenerateInNewFork(sessionId: string, msg: Message, options?: { runGenerateMore?: GenerateMoreFn }) {
  return withSessionGenerationLock(sessionId, () => regenerateInNewForkWithoutSessionLock(sessionId, msg, options))
}

async function regenerateInNewForkWithoutSessionLock(
  sessionId: string,
  msg: Message,
  options?: { runGenerateMore?: GenerateMoreFn }
) {
  const runGenerateMore = options?.runGenerateMore ?? generateActiveReplyWithoutSessionLock
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return
  }
  const location = findMessageLocation(session, msg.id)
  if (!location) {
    await _generateWithoutSessionLock(sessionId, msg, { operationType: 'regenerate' })
    return
  }
  // Skip anchored compaction summaries: a summary sits immediately after its
  // boundary and belongs to the shared prefix, so the fork pivot must be the
  // real conversation message before it (forks keyed on a summary id would
  // attach navigation to SummaryMessage and break when it is deleted).
  let previousMessageIndex = location.index - 1
  while (previousMessageIndex >= 0 && location.list[previousMessageIndex].isSummary) {
    previousMessageIndex -= 1
  }
  if (previousMessageIndex < 0) {
    // If target message is the first message, regenerate directly
    await _generateWithoutSessionLock(sessionId, msg, { operationType: 'regenerate' })
    return
  }
  const forkMessage = location.list[previousMessageIndex]
  await createNewFork(sessionId, forkMessage.id)
  return runGenerateMore(sessionId, forkMessage.id)
}

/**
 * Build message context for prompt
 * Thin wrapper over shared buildContext() for backward compatibility
 *
 * @param settings Session settings
 * @param msgs Original message list
 * @param modelSupportToolUseForFile Whether model supports file reading tool (if supported, file content is not directly included)
 * @param optionsOrAdapter Optional configuration object OR legacy storageAdapter (for backward compatibility)
 * @returns Processed message list
 */
export async function genMessageContext(
  settings: SessionSettings,
  msgs: Message[],
  modelSupportToolUseForFile: boolean,
  optionsOrAdapter?:
    | {
        storageAdapter?: { getBlob: (key: string) => Promise<string> }
        compactionPoints?: CompactionPoint[]
      }
    | { getBlob: (key: string) => Promise<string> }
): Promise<Message[]> {
  let storageAdapter: { getBlob: (key: string) => Promise<string> } | undefined
  let compactionPoints: CompactionPoint[] | undefined

  if (optionsOrAdapter) {
    if ('getBlob' in optionsOrAdapter) {
      storageAdapter = optionsOrAdapter
    } else {
      storageAdapter = optionsOrAdapter.storageAdapter
      compactionPoints = optionsOrAdapter.compactionPoints
    }
  }

  const attachmentResolver = storageAdapter
    ? createAttachmentResolverFromAdapter(storageAdapter)
    : createAttachmentResolver()

  return buildContext(msgs, {
    attachmentResolver,
    compactionPoints,
    maxContextMessageCount: settings.maxContextMessageCount,
    modelSupportToolUseForFile,
  })
}

/**
 * Helper to create AttachmentResolver from legacy storageAdapter interface
 * Used by integration tests that pass custom storage adapter
 */
function createAttachmentResolverFromAdapter(adapter: {
  getBlob: (key: string) => Promise<string>
}): AttachmentResolver {
  return {
    async read(id) {
      return adapter.getBlob(id).catch(() => null as string | null)
    },
  }
}

/**
 * Find the thread message list that a message belongs to
 * @param sessionId Session ID
 * @param messageId Message ID
 * @returns The thread message list containing the message
 */
export async function getMessageThreadContext(sessionId: string, messageId: string): Promise<Message[]> {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return []
  }
  return findMessageContext(session, messageId)?.list ?? []
}

// Re-export for backward compatibility
export { getSessionWebBrowsing } from './utils'
