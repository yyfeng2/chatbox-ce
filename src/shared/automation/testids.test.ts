import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_CONTRACT_VERSION,
  AUTOMATION_CONTRACT_VERSION_ATTRIBUTE,
  listStaticTestIds,
  TestId,
} from './testids'

describe('automation test ID contract', () => {
  it('has a versioned, unique static ID surface', () => {
    const ids = listStaticTestIds()

    expect(AUTOMATION_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids).toEqual(
      expect.arrayContaining([
        TestId.chat.messageInput,
        TestId.chat.send,
        TestId.model.selectorTrigger,
        TestId.agent.modeTrigger,
        TestId.reasoning.trigger,
        TestId.sidebar.newChat,
        TestId.message.actionBar,
        TestId.message.actionMenu,
        TestId.message.actionDeleteConfirm,
      ])
    )
  })

  it('uses dynamic IDs only for finite reasoning levels', () => {
    expect(TestId.reasoning.level('low')).toBe('reasoning-level-low')
    expect(TestId.reasoning.level('high')).toBe('reasoning-level-high')
  })

  it('keeps mobile action-bar and action-menu IDs disjoint', () => {
    const actionBarIds = [
      TestId.message.actionBarRetry,
      TestId.message.actionBarRetryBelow,
      TestId.message.actionBarEdit,
      TestId.message.actionBarCopy,
    ]
    const actionMenuIds: string[] = [
      TestId.message.actionMenuRetry,
      TestId.message.actionMenuRetryBelow,
      TestId.message.actionMenuEdit,
      TestId.message.actionMenuCopy,
    ]

    expect(actionBarIds.some((testId) => actionMenuIds.includes(testId))).toBe(false)
  })

  it('uses a stable document-root attribute for renderer automation', () => {
    expect(AUTOMATION_CONTRACT_VERSION_ATTRIBUTE).toBe('data-automation-contract-version')
  })
})
