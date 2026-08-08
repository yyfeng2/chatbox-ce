import { MESSAGE_ERROR_CODES } from '@shared/models/errors'
import type { Message } from '@shared/types'

export type MessageErrorPresentation =
  | 'generic-error'
  | 'quota-exhausted'
  | 'free-quota-exhausted'
  | 'ocr-quota-exhausted'
  | 'free-ocr-quota-exhausted'
  | 'agent-mode-reward'

/**
 * Resolves a persisted client error code into a renderer-only presentation kind.
 * Presentation kinds control UI only and are not persisted or sent to the backend.
 */
export function resolveMessageErrorPresentation(msg: Message): MessageErrorPresentation {
  switch (msg.errorCode) {
    case MESSAGE_ERROR_CODES.CHATBOX_AI_QUOTA_EXHAUSTED:
      return 'quota-exhausted'
    case MESSAGE_ERROR_CODES.CHATBOX_AI_FREE_QUOTA_EXHAUSTED:
      return 'free-quota-exhausted'
    case MESSAGE_ERROR_CODES.CHATBOX_AI_OCR_QUOTA_EXHAUSTED:
      return 'ocr-quota-exhausted'
    case MESSAGE_ERROR_CODES.CHATBOX_AI_FREE_OCR_QUOTA_EXHAUSTED:
      return 'free-ocr-quota-exhausted'
    case MESSAGE_ERROR_CODES.CHATBOX_AI_FREE_AGENT_MODE_QUOTA_EXHAUSTED:
      return 'agent-mode-reward'
  }
  return 'generic-error'
}

export function isMessageReminderPresentation(presentation: MessageErrorPresentation): boolean {
  return presentation !== 'generic-error'
}
