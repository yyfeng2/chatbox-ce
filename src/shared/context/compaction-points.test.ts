import { describe, expect, it } from 'vitest'
import type { CompactionPoint, Message } from '../types'
import { findLatestApplicableCompactionPoint } from './compaction-points'

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    contentParts: [],
    ...overrides,
  }
}

function point(summaryMessageId: string, boundaryMessageId: string, createdAt: number): CompactionPoint {
  return { summaryMessageId, boundaryMessageId, createdAt }
}

describe('findLatestApplicableCompactionPoint', () => {
  const messages = [
    message('u1', { role: 'user' }),
    message('a1'),
    message('s1', { isSummary: true }),
    message('u2', { role: 'user' }),
    message('a2'),
    message('s2', { isSummary: true }),
  ]

  it('returns undefined without compaction points', () => {
    expect(findLatestApplicableCompactionPoint(messages, undefined)).toBeUndefined()
    expect(findLatestApplicableCompactionPoint(messages, [])).toBeUndefined()
  })

  it('picks the newest point when boundary and summary are both present', () => {
    const older = point('s1', 'a1', 1000)
    const newer = point('s2', 'a2', 2000)

    expect(findLatestApplicableCompactionPoint(messages, [older, newer])).toBe(newer)
    expect(findLatestApplicableCompactionPoint(messages, [newer, older])).toBe(newer)
  })

  it('skips a point whose summary is not on the current path', () => {
    const tornApart = point('summary-on-sibling-branch', 'a2', 2000)

    expect(findLatestApplicableCompactionPoint(messages, [tornApart])).toBeUndefined()
  })

  it('skips a point whose boundary is not on the current path', () => {
    const tornApart = point('s2', 'boundary-on-sibling-branch', 2000)

    expect(findLatestApplicableCompactionPoint(messages, [tornApart])).toBeUndefined()
  })

  it('falls back to an older fully-applicable point when the newest is torn apart', () => {
    const older = point('s1', 'a1', 1000)
    const tornApart = point('summary-on-sibling-branch', 'a2', 2000)

    expect(findLatestApplicableCompactionPoint(messages, [older, tornApart])).toBe(older)
  })
})
