import { describe, expect, it } from 'vitest'
import type { Session } from '../types/session'
import { filterNativeChatSessions } from './native-session-search'

const sessions: Session[] = [
  {
    id: 'session-1',
    name: 'Release Planning',
    threadName: 'Current',
    messages: [
      {
        id: 'message-1',
        role: 'user',
        contentParts: [{ type: 'text', text: 'Discuss native rollout' }],
      },
    ],
  },
  {
    id: 'session-2',
    name: 'Attachment Notes',
    threadName: 'Current',
    messages: [
      {
        id: 'message-2',
        role: 'user',
        contentParts: [{ type: 'text', text: 'See attached file' }],
        files: [{ id: 'file-1', name: 'budget.csv', fileType: 'text/csv' }],
      },
    ],
  },
  {
    id: 'session-3',
    name: 'Archived Topic',
    threadName: 'Current',
    messages: [],
    threads: [
      {
        id: 'thread-1',
        name: 'Historical Thread',
        createdAt: 1,
        messages: [
          {
            id: 'message-3',
            role: 'assistant',
            contentParts: [{ type: 'text', text: 'Previous markdown verification notes' }],
          },
        ],
      },
    ],
  },
]

describe('native-session-search', () => {
  it('returns all sessions for blank query', () => {
    expect(filterNativeChatSessions(sessions, '  ')).toEqual(sessions)
  })

  it('matches session titles case-insensitively', () => {
    expect(filterNativeChatSessions(sessions, 'release').map((session) => session.id)).toEqual(['session-1'])
  })

  it('matches current message text and attachment names', () => {
    expect(filterNativeChatSessions(sessions, 'native rollout').map((session) => session.id)).toEqual(['session-1'])
    expect(filterNativeChatSessions(sessions, 'budget.csv').map((session) => session.id)).toEqual(['session-2'])
  })

  it('matches history thread names and messages', () => {
    expect(filterNativeChatSessions(sessions, 'historical').map((session) => session.id)).toEqual(['session-3'])
    expect(filterNativeChatSessions(sessions, 'markdown verification').map((session) => session.id)).toEqual([
      'session-3',
    ])
  })
})
