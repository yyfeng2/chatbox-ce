import type { Message } from '@shared/types'

export function isUserNavigationMessage(message: Message): boolean {
  return message.role === 'user' && !message.isSummary && !message.backgroundTask
}
