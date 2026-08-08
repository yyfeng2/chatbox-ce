import type { Message } from '@shared/types'
import { getMessageText, isEmptyMessage } from '@shared/utils/message'

const UNSUCCESSFUL_FINISH_REASONS = new Set([
  'agent-mode-suggested',
  'canceled',
  'cancelled',
  'content-filter',
  'error',
  'tool-call-paused',
])

function hasMeaningfulAssistantOutput(message: Message): boolean {
  const text = getMessageText(message, true, true).trim()
  if (text.length > 0) return true

  return message.contentParts.some((part) => {
    if (part.type === 'image') return true
    if (part.type !== 'tool-call') return false
    return part.state === 'result' && part.result !== undefined
  })
}

export function isSuccessfulAssistantReply(message: Message): boolean {
  if (message.role !== 'assistant') return false
  if (message.generating) return false
  if (message.error || message.errorCode) return false
  if (message.finishReason && UNSUCCESSFUL_FINISH_REASONS.has(message.finishReason)) return false
  if (message.contentParts.some((part) => part.type === 'agent-mode-suggestion')) return false
  if (message.contentParts.some((part) => part.type === 'tool-call' && part.state === 'paused')) return false
  return hasMeaningfulAssistantOutput(message)
}

export function hasSuccessfulUserAssistantTurn(messages: Message[]): boolean {
  let hasPreviousUserMessage = false

  for (const message of messages) {
    if (message.role === 'user' && !isEmptyMessage(message)) {
      hasPreviousUserMessage = true
      continue
    }

    if (hasPreviousUserMessage && isSuccessfulAssistantReply(message)) {
      return true
    }
  }

  return false
}
