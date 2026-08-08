// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approvalAttentionStore,
  clearApprovalInputNudge,
  flashApprovalCardHighlight,
  notifyApprovalInputNudge,
  setApprovalActionsVisible,
} from './approvalAttentionStore'

beforeEach(() => {
  approvalAttentionStore.setState({ visibleActionInstances: {}, highlightedToolCallId: null, nudgedToolCallId: null })
})

describe('approval actions visibility', () => {
  it('tracks visibility per tool call and instance', () => {
    setApprovalActionsVisible('tc-1', 'a', true)
    expect(approvalAttentionStore.getState().visibleActionInstances).toEqual({ 'tc-1': { a: true } })
    setApprovalActionsVisible('tc-1', 'a', false)
    expect(approvalAttentionStore.getState().visibleActionInstances).toEqual({})
  })

  it('keeps the card visible while any instance still reports visible', () => {
    // The same card can be mounted twice (message list + search dialog); one
    // instance unmounting must not hide the other's visibility.
    setApprovalActionsVisible('tc-1', 'list', true)
    setApprovalActionsVisible('tc-1', 'search', true)
    setApprovalActionsVisible('tc-1', 'search', false)
    expect(approvalAttentionStore.getState().visibleActionInstances).toEqual({ 'tc-1': { list: true } })
  })
})

describe('highlight flash', () => {
  it('flashes the highlight and clears it after the timeout', () => {
    vi.useFakeTimers()
    try {
      flashApprovalCardHighlight('tc-1')
      expect(approvalAttentionStore.getState().highlightedToolCallId).toBe('tc-1')
      vi.advanceTimersByTime(5100)
      expect(approvalAttentionStore.getState().highlightedToolCallId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the latest highlight when re-flashed before the timeout', () => {
    vi.useFakeTimers()
    try {
      flashApprovalCardHighlight('tc-1')
      vi.advanceTimersByTime(4000)
      flashApprovalCardHighlight('tc-2')
      vi.advanceTimersByTime(4500)
      expect(approvalAttentionStore.getState().highlightedToolCallId).toBe('tc-2')
      vi.advanceTimersByTime(700)
      expect(approvalAttentionStore.getState().highlightedToolCallId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('input nudge', () => {
  it('is keyed by tool call id and cleared explicitly', () => {
    notifyApprovalInputNudge('tc-1')
    expect(approvalAttentionStore.getState().nudgedToolCallId).toBe('tc-1')
    clearApprovalInputNudge()
    expect(approvalAttentionStore.getState().nudgedToolCallId).toBeNull()
  })
})
