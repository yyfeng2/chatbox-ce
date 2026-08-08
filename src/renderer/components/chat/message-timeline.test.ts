import type { MessageContentParts } from '@shared/types'
import { describe, expect, test } from 'vitest'
import { createMessageTimelineLayout } from './message-timeline'

const reasoning = { type: 'reasoning' as const, text: 'Private reasoning' }
const answer = { type: 'text' as const, text: 'Final answer' }

describe('createMessageTimelineLayout', () => {
  test('preserves v1.21 rendering order for non-streaming text followed by reasoning', () => {
    const contentParts: MessageContentParts = [answer, reasoning]

    const result = createMessageTimelineLayout(contentParts, false)

    expect(result.orderedContentParts).toBe(contentParts)
    expect(result.groupedContentParts).toEqual([answer, { type: 'step_group', parts: [reasoning] }])
  })

  test('keeps correctly ordered streaming reasoning responses unchanged', () => {
    const contentParts: MessageContentParts = [reasoning, answer]

    const result = createMessageTimelineLayout(contentParts, true)

    expect(result.orderedContentParts).toBe(contentParts)
    expect(result.groupedContentParts).toEqual([{ type: 'step_group', parts: [reasoning] }, answer])
  })

  test('does not reinterpret messages without an explicit non-streaming marker', () => {
    const contentParts: MessageContentParts = [answer, reasoning]

    const result = createMessageTimelineLayout(contentParts, undefined)

    expect(result.orderedContentParts).toBe(contentParts)
    expect(result.groupedContentParts).toEqual([{ type: 'step_group', parts: [answer, reasoning] }])
  })

  test('keeps tool calls as ordering boundaries', () => {
    const toolCall = {
      type: 'tool-call' as const,
      state: 'result' as const,
      toolCallId: 'tool-1',
      toolName: 'search',
      args: {},
      result: 'done',
    }
    const contentParts: MessageContentParts = [answer, toolCall, reasoning]

    const result = createMessageTimelineLayout(contentParts, false)

    expect(result.orderedContentParts).toBe(contentParts)
    expect(result.groupedContentParts).toEqual([{ type: 'step_group', parts: [answer, toolCall, reasoning] }])
  })

  test('keeps alternating multi-step content in its original order', () => {
    const reasoning2 = { type: 'reasoning' as const, text: 'Second reasoning' }
    const answer2 = { type: 'text' as const, text: 'Second answer' }
    const contentParts: MessageContentParts = [reasoning, answer, reasoning2, answer2]

    const result = createMessageTimelineLayout(contentParts, false)

    expect(result.orderedContentParts).toBe(contentParts)
    expect(result.groupedContentParts).toEqual([
      { type: 'step_group', parts: [reasoning, answer, reasoning2] },
      answer2,
    ])
  })

  test('keeps multiple text and reasoning parts in their original order', () => {
    const reasoning2 = { type: 'reasoning' as const, text: 'Second reasoning' }
    const answer2 = { type: 'text' as const, text: 'Second answer' }
    const contentParts: MessageContentParts = [answer, reasoning, answer2, reasoning2]

    const result = createMessageTimelineLayout(contentParts, false)

    expect(result.orderedContentParts).toBe(contentParts)
  })
})
