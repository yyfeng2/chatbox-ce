import type { Session, SessionMeta, SessionMetaRecord } from '@shared/types'
import { mapValues } from 'lodash'
import { finalizeStaleGeneratingMessage, migrateMessage } from '../../shared/utils/message'

// Also finalizes messages a crash/reload left flagged `generating` — otherwise
// they spin forever in the UI and are silently dropped from every model context.
function loadMessage(message: Parameters<typeof migrateMessage>[0]) {
  return finalizeStaleGeneratingMessage(migrateMessage(message))
}

export function migrateSession(session: Session): Session {
  return {
    ...session,
    settings: {
      // temperature未设置的时候使用默认值undefined，这样才能覆盖全局设置
      temperature: undefined,
      ...session.settings,
    },
    messages: session.messages?.map((m) => loadMessage(m)) || [],
    threads: session.threads?.map((t) => ({
      ...t,
      messages: t.messages.map((m) => loadMessage(m)) || [],
    })),
    messageForksHash: mapValues(session.messageForksHash || {}, (forks) => ({
      ...forks,
      lists:
        forks.lists?.map((list) => ({
          ...list,
          messages: list.messages?.map((m) => loadMessage(m)) || [],
        })) || [],
    })),
  }
}

// Single source shared with the native mobile shell.
import { sortSessions } from '@shared/utils/session-sort'

export { sortSessions }

export function createSessionMetaRecordsFromLegacyList(sessions: SessionMeta[], now = Date.now()): SessionMetaRecord[] {
  const sortedVisibleSessions = sortSessions(sessions)
  const sortOrderById = new Map(sortedVisibleSessions.map((session, i) => [session.id, now - i * 1000]))
  const hiddenSortOrderStart = now - sortedVisibleSessions.length * 1000

  return sessions.map((session, i) => ({
    ...session,
    sortOrder: sortOrderById.get(session.id) ?? hiddenSortOrderStart - i * 1000,
    createdAt: now - i * 1000,
  }))
}
