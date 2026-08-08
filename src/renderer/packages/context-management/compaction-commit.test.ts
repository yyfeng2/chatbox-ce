import type { CompactionPoint, Message, Session } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { buildCompactionCommitPatch } from './compaction-commit'
import { buildContextForAI } from './context-builder'

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    contentParts: [],
    ...overrides,
  }
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test',
    messages: [],
    ...overrides,
  }
}

function point(summaryMessageId: string, boundaryMessageId: string): CompactionPoint {
  return { summaryMessageId, boundaryMessageId, createdAt: Date.now() }
}

const summary = message('summary', { isSummary: true })

describe('buildCompactionCommitPatch', () => {
  it('inserts the summary right after the boundary on the active path', () => {
    const current = session({
      messages: [message('u1', { role: 'user' }), message('a1')],
    })
    const compactionPoint = point('summary', 'a1')

    const patch = buildCompactionCommitPatch(current, summary, compactionPoint)

    expect(patch?.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'summary'])
    expect(patch?.compactionPoints).toEqual([compactionPoint])
  })

  it('keeps the summary adjacent to a boundary that is no longer the tail', () => {
    // A user message was inserted concurrently after the snapshot was taken.
    const current = session({
      messages: [message('u1', { role: 'user' }), message('a1'), message('u2', { role: 'user' })],
    })

    const patch = buildCompactionCommitPatch(current, summary, point('summary', 'a1'))

    expect(patch?.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'summary', 'u2'])
  })

  it('routes the summary into the fork branch holding the boundary after a branch switch', () => {
    // Compaction started on branch X (tail: a1-x); the user switched to branch
    // Y during streaming, so X's tail now lives in the fork list.
    const current = session({
      messages: [message('u1', { role: 'user' }), message('a1-y')],
      messageForksHash: {
        u1: {
          position: 1,
          createdAt: Date.now(),
          lists: [
            { id: 'list-x', messages: [message('a1-x'), message('u2-x', { role: 'user' }), message('a2-x')] },
            { id: 'list-y', messages: [] },
          ],
        },
      },
    })

    const compactionPoint = point('summary', 'a2-x')

    const patch = buildCompactionCommitPatch(current, summary, compactionPoint)

    expect(patch?.messages.map((m) => m.id)).toEqual(['u1', 'a1-y'])
    expect(patch?.messageForksHash?.u1.lists[0].messages.map((m) => m.id)).toEqual(['a1-x', 'u2-x', 'a2-x', 'summary'])
    expect(patch?.compactionPoints).toEqual([compactionPoint])
  })

  it('stores the point on the thread when the boundary fork is only reachable from an archived thread', () => {
    // Reply Again moved the boundary into a saved fork list, then New Thread
    // archived the conversation: the fork pivot (u1) now lives in a thread.
    const current = session({
      messages: [message('sys', { role: 'system' })],
      threads: [
        {
          id: 'thread-1',
          name: 'archived',
          createdAt: Date.now(),
          messages: [message('u1', { role: 'user' }), message('a1-y')],
        },
      ],
      messageForksHash: {
        u1: {
          position: 1,
          createdAt: Date.now(),
          lists: [
            { id: 'list-x', messages: [message('a1-x')] },
            { id: 'list-y', messages: [] },
          ],
        },
      },
    })
    const compactionPoint = point('summary', 'a1-x')

    const patch = buildCompactionCommitPatch(current, summary, compactionPoint)

    // Summary inserted into the fork list, point stored on the owning thread
    // (archived-thread generation reads only the source thread's points).
    expect(patch?.messageForksHash?.u1.lists[0].messages.map((m) => m.id)).toEqual(['a1-x', 'summary'])
    expect(patch?.threads?.[0].compactionPoints).toEqual([compactionPoint])
    expect(patch?.compactionPoints).toBeUndefined()
  })

  it('makes the compaction applicable again once the original branch is switched back', () => {
    // Continue the scenario above: branch X's tail (with the routed summary)
    // returns to the active path, exactly as a fork switch would splice it.
    const branchXTail = [message('a1-x'), message('u2-x', { role: 'user' }), message('a2-x'), summary]
    const activeMessages = [message('u1', { role: 'user' }), ...branchXTail]

    const context = buildContextForAI({
      messages: activeMessages,
      compactionPoints: [point('summary', 'a2-x')],
    })

    expect(context.map((m) => m.id)).toEqual(['summary'])
  })

  it('routes the summary into an archived thread holding the boundary', () => {
    // The conversation was archived into a thread (start-new-thread) while the
    // summary streamed.
    const current = session({
      messages: [message('sys', { role: 'system' })],
      threads: [
        {
          id: 'thread-1',
          name: 'old thread',
          createdAt: Date.now(),
          messages: [message('u1', { role: 'user' }), message('a1')],
        },
      ],
    })
    const compactionPoint = point('summary', 'a1')

    const patch = buildCompactionCommitPatch(current, summary, compactionPoint)

    expect(patch?.messages.map((m) => m.id)).toEqual(['sys'])
    expect(patch?.threads?.[0].messages.map((m) => m.id)).toEqual(['u1', 'a1', 'summary'])
    // The point must live on the thread: thread context building and
    // moveThreadToConversations read the thread's own compactionPoints.
    expect(patch?.threads?.[0].compactionPoints).toEqual([compactionPoint])
    expect(patch?.compactionPoints).toBeUndefined()
  })

  it('returns null when the boundary message was deleted', () => {
    const current = session({
      messages: [message('u1', { role: 'user' })],
    })

    expect(buildCompactionCommitPatch(current, summary, point('summary', 'deleted-boundary'))).toBeNull()
  })

  it('does not mutate the input session', () => {
    const messages = [message('u1', { role: 'user' }), message('a1')]
    const current = session({ messages })

    buildCompactionCommitPatch(current, summary, point('summary', 'a1'))

    expect(current.messages).toBe(messages)
    expect(current.messages.map((m) => m.id)).toEqual(['u1', 'a1'])
    expect(current.compactionPoints).toBeUndefined()
  })
})
