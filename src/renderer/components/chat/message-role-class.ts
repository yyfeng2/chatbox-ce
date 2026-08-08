import type { Message } from '@shared/types'

const messageRoleClasses: Record<Message['role'], string> = {
  user: 'user-msg',
  system: 'system-msg',
  assistant: 'assistant-msg',
  tool: 'tool-msg',
}

export function getMessageRoleClass(role: Message['role']): string {
  return messageRoleClasses[role]
}
