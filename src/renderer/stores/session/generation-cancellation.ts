import type { Message, MessageContentParts, MessageContentToolCallPart } from '@shared/types'

export interface GenerationCancellationPersistence {
  removeMessage: (sessionId: string, messageId: string) => Promise<void>
  persistMessage: (sessionId: string, message: Message) => Promise<void>
}

function updateToolCallParts(
  message: Message,
  shouldUpdate: (part: MessageContentToolCallPart) => boolean,
  updater: (part: MessageContentToolCallPart) => MessageContentToolCallPart
): Message {
  return {
    ...message,
    contentParts: message.contentParts.map((part) =>
      part.type === 'tool-call' && shouldUpdate(part) ? updater(part) : part
    ),
  }
}

export function cancelRunningToolCallBatch(
  message: Message,
  toolCallIds: ReadonlySet<string>,
  stoppedAt = Date.now()
): Message {
  return updateToolCallParts(
    message,
    (part) => toolCallIds.has(part.toolCallId) && part.state === 'call',
    (part) => {
      const duration = part.startTime ? stoppedAt - part.startTime : undefined
      if (part.toolName === 'user_exec' || part.toolName === 'code_execution') {
        return {
          ...part,
          state: 'result',
          pauseReason: undefined,
          resultStorageKey: undefined,
          result: { success: false, exitCode: 130, stdout: '', stderr: '', cancelled: true },
          duration,
        }
      }
      return {
        ...part,
        state: 'error',
        pauseReason: undefined,
        resultStorageKey: undefined,
        result: { error: 'Tool execution stopped by user.', cancelled: true },
        duration,
      }
    }
  )
}

/** Finalize every active step when the user stops the main generation stream. */
export function finishAbortedGeneration(
  message: Message,
  contentParts: MessageContentParts,
  stoppedAt = Date.now()
): Message {
  const runningToolCallIds = new Set<string>()
  const finalizedParts = contentParts.map((part) => {
    if (part.type === 'tool-call' && part.state === 'call') {
      runningToolCallIds.add(part.toolCallId)
    }
    if (part.type === 'reasoning' && part.startTime && !part.duration) {
      return { ...part, duration: stoppedAt - part.startTime }
    }
    return part
  })

  return cancelRunningToolCallBatch(
    {
      ...message,
      generating: false,
      cancel: undefined,
      contentParts: finalizedParts,
      status: [],
      finishReason: 'canceled',
    },
    runningToolCallIds,
    stoppedAt
  )
}

export async function stopGeneratingMessages(
  sessionId: string,
  messages: readonly Message[],
  persistence: GenerationCancellationPersistence,
  stoppedAt = Date.now()
): Promise<void> {
  for (const message of messages) {
    message.cancel?.(stoppedAt)
  }

  await Promise.all(
    messages.map((message) =>
      message.contentParts.length === 0
        ? persistence.removeMessage(sessionId, message.id)
        : persistence.persistMessage(sessionId, finishAbortedGeneration(message, message.contentParts, stoppedAt))
    )
  )
}
