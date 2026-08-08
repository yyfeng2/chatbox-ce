import type { Session } from '@shared/types'
import { hasSuccessfulUserAssistantTurn } from '@/stores/session'

export type AutoTitleGenerationAction = 'session-and-thread' | 'thread'

export function getAutoTitleGenerationAction(
  session: Pick<Session, 'messages' | 'name' | 'threadName'>
): AutoTitleGenerationAction | null {
  if (session.messages.some((message) => message.generating)) return null
  if (!hasSuccessfulUserAssistantTurn(session.messages)) return null
  if (session.name === 'Untitled') return 'session-and-thread'
  if (!session.threadName) return 'thread'
  return null
}
