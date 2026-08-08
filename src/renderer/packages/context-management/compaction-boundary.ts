import { isContextEligibleMessage } from '@shared/context'
import type { Message } from '@shared/types'

/**
 * Finds the last message that can serve as a compaction boundary.
 *
 * The boundary must survive context building's eligibility filter
 * (see `isContextEligibleMessage`), otherwise context building cannot
 * locate it and falls back to full history. Summary messages are also
 * excluded: a summary must never be its own boundary.
 */
export function findLastCompactionBoundaryMessage(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (isContextEligibleMessage(message) && !message.isSummary) {
      return message
    }
  }

  return undefined
}
