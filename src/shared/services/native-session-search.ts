import type { Message, Session } from '../types/session'
import { getMessageText } from '../utils/message'

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function getSearchableMessageText(session: Session): string {
  const currentMessages = session.messages
  const historyMessages = session.threads?.flatMap((thread) => thread.messages) ?? []
  const messages = [...currentMessages, ...historyMessages]

  return messages
    .flatMap((message) => [
      ...message.contentParts.map((part) => {
        if (part.type === 'text') return part.text
        if (part.type === 'reasoning') return part.text
        if (part.type === 'info') return part.text
        if (part.type === 'tool-call') return `${part.toolName} ${part.state}`
        return ''
      }),
      ...(message.files?.map((file) => file.name) ?? []),
    ])
    .filter(Boolean)
    .join('\n')
}

function getSearchableSessionText(session: Session): string {
  return [
    session.name,
    session.threadName,
    ...(session.threads?.map((thread) => thread.name) ?? []),
    getSearchableMessageText(session),
  ]
    .filter(Boolean)
    .join('\n')
}

export function filterNativeChatSessions(sessions: Session[], query: string): Session[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return sessions

  return sessions.filter((session) => normalizeSearchText(getSearchableSessionText(session)).includes(normalizedQuery))
}

/** The renderer's search-input escaping (sessionHelpers.searchSessions). */
export function escapeSearchInput(input: string): string {
  return input.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

/**
 * The renderer's per-session message matcher (_searchSessions): newest-first
 * matches from the current thread, then history threads.
 */
export function searchSessionMessages(session: Session, query: string): Message[] {
  const regexp = new RegExp(escapeSearchInput(query), 'i')
  const matchedMessages: Message[] = []
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i]
    if (regexp.test(getMessageText(message))) {
      matchedMessages.push(message)
    }
  }
  if (session.threads) {
    for (let i = session.threads.length - 1; i >= 0; i--) {
      const thread = session.threads[i]
      for (let j = thread.messages.length - 1; j >= 0; j--) {
        const message = thread.messages[j]
        if (regexp.test(getMessageText(message))) {
          matchedMessages.push(message)
        }
      }
    }
  }
  return matchedMessages
}

export interface NativeSearchHit {
  sessionId: string
  sessionName: string
  message: Message
}

const NATIVE_SEARCH_RESULT_LIMIT = 50

/** Search loaded sessions (optionally scoped to one) and return message hits. */
export function searchNativeSessionMessages(
  sessions: Session[],
  query: string,
  options: { sessionId?: string; limit?: number } = {}
): NativeSearchHit[] {
  const normalized = query.trim()
  if (!normalized) return []
  const limit = options.limit ?? NATIVE_SEARCH_RESULT_LIMIT
  const scoped = options.sessionId ? sessions.filter((session) => session.id === options.sessionId) : sessions
  const hits: NativeSearchHit[] = []
  for (const session of scoped) {
    for (const message of searchSessionMessages(session, normalized)) {
      hits.push({ sessionId: session.id, sessionName: session.name, message })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
