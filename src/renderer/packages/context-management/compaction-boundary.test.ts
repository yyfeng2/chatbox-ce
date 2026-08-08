import type { Message } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { findLastCompactionBoundaryMessage } from './compaction-boundary'
import { buildContextForAI } from './context-builder'

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    contentParts: [],
    ...overrides,
  }
}

describe('findLastCompactionBoundaryMessage', () => {
  it('ignores a trailing copied-session fork marker', () => {
    const lastConversationMessage = message('assistant-response')
    const forkMarker = message('fork-marker', { isForkMarker: true })

    expect(findLastCompactionBoundaryMessage([lastConversationMessage, forkMarker])).toBe(lastConversationMessage)
  })

  it('compacts a copied session to the summary instead of falling back to full history', () => {
    const originalMessages = [
      message('user-message', { role: 'user' }),
      message('assistant-response'),
      message('fork-marker', { isForkMarker: true }),
    ]
    const boundaryMessage = findLastCompactionBoundaryMessage(originalMessages)
    const summary = message('summary', { isSummary: true })

    const context = buildContextForAI({
      messages: [...originalMessages, summary],
      compactionPoints: [
        {
          summaryMessageId: summary.id,
          boundaryMessageId: boundaryMessage?.id ?? '',
          createdAt: Date.now(),
        },
      ],
    })

    expect(context.map((item) => item.id)).toEqual([summary.id])
  })

  it('uses the same completed-message criteria as context building', () => {
    const lastConversationMessage = message('user-message', { role: 'user' })
    const summary = message('summary', { isSummary: true })
    const generatingMessage = message('generating', { generating: true })

    expect(findLastCompactionBoundaryMessage([lastConversationMessage, summary, generatingMessage])).toBe(
      lastConversationMessage
    )
  })

  it('returns undefined when there is no eligible boundary message', () => {
    expect(
      findLastCompactionBoundaryMessage([
        message('fork-marker', { isForkMarker: true }),
        message('summary', { isSummary: true }),
      ])
    ).toBeUndefined()
  })
})
