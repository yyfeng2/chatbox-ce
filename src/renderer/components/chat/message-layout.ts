import type { Message } from '@shared/types'

type MessageLayout = 'left' | 'bubble' | undefined

export function shouldRightAlignMessage(messageLayout: MessageLayout, role: Message['role']): boolean {
  return messageLayout === 'bubble' && role === 'user'
}
