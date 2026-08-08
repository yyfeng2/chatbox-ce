import {
  buildCreateForkPatch,
  buildCreateInactiveForkPatch,
  buildDeleteForkPatch,
  buildExpandForkPatch,
  buildSwitchForkPatch,
  buildSwitchForkToPatch,
  findMessageLocation,
  forkTailStartIndex,
} from '@shared/session/message-forks'
import type { Message } from '@shared/types'
import * as chatStore from '../chatStore'

// The pure fork transforms live in `@shared/session/message-forks` so the
// mobile-native app reuses the exact same branching logic. This module only
// wraps them in the renderer's `chatStore.updateSessionWithMessages` queue.
export { findMessageLocation }

// Every fork mutation is a full-session write and must pass
// `preserveCachedGeneratingMessages`: alternative replies stream outside the
// session generation lock with cache-only chunk updates, so a plain write would
// roll their visible content back to the last 2s persistence snapshot.

/**
 * Create a new fork branch at the specified message
 */
export async function createNewFork(sessionId: string, forkMessageId: string) {
  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }
      const patch = buildCreateForkPatch(session, forkMessageId)
      if (!patch) {
        return session
      }
      return {
        ...session,
        ...patch,
      }
    },
    { preserveCachedGeneratingMessages: true }
  )
}

/**
 * Create an inactive branch and return the isolated message path that should be
 * used to generate its first reply. Returns null when the fork point has no
 * active answer yet.
 */
export async function createInactiveFork(
  sessionId: string,
  forkMessageId: string,
  branchMessages: Message[]
): Promise<Message[] | null> {
  let branchContext: Message[] | null = null

  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }

      const location = findMessageLocation(session, forkMessageId)
      if (!location) {
        return session
      }

      const patch = buildCreateInactiveForkPatch(session, forkMessageId, branchMessages)
      if (!patch) {
        return session
      }

      // Include compaction summaries anchored to the fork point: they belong
      // to the shared prefix, so the new candidate generates with the
      // compacted context instead of the full (or empty) history.
      branchContext = [...location.list.slice(0, forkTailStartIndex(location.list, location.index)), ...branchMessages]
      return {
        ...session,
        ...patch,
      }
    },
    { preserveCachedGeneratingMessages: true }
  )

  return branchContext
}

/**
 * Switch between fork branches
 */
export async function switchFork(sessionId: string, forkMessageId: string, direction: 'next' | 'prev') {
  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }
      const patch = buildSwitchForkPatch(session, forkMessageId, direction)
      if (!patch) {
        return session
      }
      return {
        ...session,
        ...patch,
      } as typeof session
    },
    { preserveCachedGeneratingMessages: true }
  )
}

/**
 * Switch directly to a saved fork branch by its position.
 */
export async function switchForkTo(sessionId: string, forkMessageId: string, position: number) {
  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }
      const patch = buildSwitchForkToPatch(session, forkMessageId, position)
      if (!patch) {
        return session
      }
      return {
        ...session,
        ...patch,
      } as typeof session
    },
    { preserveCachedGeneratingMessages: true }
  )
}

/**
 * Delete the current fork branch
 */
export async function deleteFork(sessionId: string, forkMessageId: string) {
  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }
      const patch = buildDeleteForkPatch(session, forkMessageId)
      if (!patch) {
        return session
      }
      return {
        ...session,
        ...patch,
      }
    },
    { preserveCachedGeneratingMessages: true }
  )
}

/**
 * Expand all fork branches into the current message list
 * @deprecated
 */
export async function expandFork(sessionId: string, forkMessageId: string) {
  await chatStore.updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error('Session not found')
      }
      const patch = buildExpandForkPatch(session, forkMessageId)
      if (!patch) {
        return session
      }
      return {
        ...session,
        ...patch,
      }
    },
    { preserveCachedGeneratingMessages: true }
  )
}
