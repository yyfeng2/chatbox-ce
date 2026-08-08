import { findMessageSourceThread } from '@shared/session/message-forks'
import type { CompactionPoint, Message, Session } from '@shared/types'

/**
 * Commit a finished compaction onto the session: insert the summary message
 * immediately after its boundary message — wherever that boundary lives right
 * now (active messages, a saved fork branch, or an archived thread).
 *
 * Summary generation streams for seconds; meanwhile the user may switch fork
 * branches or archive the conversation into a thread, moving the boundary off
 * the active path. Blindly appending the summary to the active tail would pair
 * it with the wrong branch (and leave a compaction point that can never apply).
 * Inserting adjacent to the boundary keeps the pair together so they travel
 * through fork switches as one unit, and the point becomes applicable exactly
 * when that branch is active (see findLatestApplicableCompactionPoint).
 *
 * The compaction point is stored next to whichever conversation owns the
 * boundary: thread-level when the boundary's tree (including fork branches
 * reachable from it) belongs to an archived thread, session-level otherwise.
 * This matches the read paths — thread context building,
 * moveThreadToConversations and getCompactionPointsForTarget all read the
 * owning container's points.
 *
 * Returns null when the boundary message no longer exists anywhere (deleted
 * during the streaming window): the summary has nothing to anchor to and the
 * compaction must be abandoned.
 */
export function buildCompactionCommitPatch(
  session: Session,
  summaryMessage: Message,
  compactionPoint: CompactionPoint
): Session | null {
  const { boundaryMessageId } = compactionPoint
  // Ownership decides where the point is stored; it may differ from the
  // physical insertion list (e.g. boundary in a fork list whose pivot lives
  // in an archived thread).
  const owningThreadId = findMessageSourceThread(session, boundaryMessageId)?.id ?? null
  const withPoint = (patch: Partial<Session>): Session => {
    const base = { ...session, ...patch }
    if (!owningThreadId) {
      return { ...base, compactionPoints: [...(session.compactionPoints ?? []), compactionPoint] }
    }
    const threads = (patch.threads ?? session.threads ?? []).map((thread) =>
      thread.id === owningThreadId
        ? { ...thread, compactionPoints: [...(thread.compactionPoints ?? []), compactionPoint] }
        : thread
    )
    return { ...base, threads }
  }

  const rootIndex = session.messages.findIndex((m) => m.id === boundaryMessageId)
  if (rootIndex >= 0) {
    return withPoint({ messages: insertAfter(session.messages, rootIndex, summaryMessage) })
  }

  for (const [pivotId, fork] of Object.entries(session.messageForksHash ?? {})) {
    for (let listIndex = 0; listIndex < fork.lists.length; listIndex++) {
      const branchIndex = fork.lists[listIndex].messages.findIndex((m) => m.id === boundaryMessageId)
      if (branchIndex < 0) {
        continue
      }
      const lists = fork.lists.map((list, index) =>
        index === listIndex ? { ...list, messages: insertAfter(list.messages, branchIndex, summaryMessage) } : list
      )
      return withPoint({
        messageForksHash: {
          ...session.messageForksHash,
          [pivotId]: { ...fork, lists },
        },
      })
    }
  }

  const threads = session.threads ?? []
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const messageIndex = threads[threadIndex].messages.findIndex((m) => m.id === boundaryMessageId)
    if (messageIndex < 0) {
      continue
    }
    const updatedThreads = threads.map((thread, index) =>
      index === threadIndex
        ? { ...thread, messages: insertAfter(thread.messages, messageIndex, summaryMessage) }
        : thread
    )
    return withPoint({ threads: updatedThreads })
  }

  return null
}

function insertAfter(messages: Message[], index: number, message: Message): Message[] {
  return [...messages.slice(0, index + 1), message, ...messages.slice(index + 1)]
}
