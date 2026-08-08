import type { Message, MessageToolCallPart } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { getApprovalPreview, isApprovalPauseReason, listPendingApprovalToolCalls } from './message-approval'

type TestMessage = Pick<Message, 'id' | 'contentParts'>

function makeToolCallPart(overrides: Partial<MessageToolCallPart>): MessageToolCallPart {
  return {
    type: 'tool-call',
    state: 'paused',
    toolCallId: 'tc-1',
    toolName: 'user_exec',
    ...overrides,
  }
}

describe('isApprovalPauseReason', () => {
  it('accepts the three approval pause types and rejects the rest', () => {
    expect(isApprovalPauseReason({ type: 'user_exec_approval', command: 'ls' })).toBe(true)
    expect(isApprovalPauseReason({ type: 'file_mutation_approval', title: 'Edit', preview: '' })).toBe(true)
    expect(
      isApprovalPauseReason({ type: 'app_action_approval', action: 'image.generate', title: 'Generate', preview: '' })
    ).toBe(true)
    expect(isApprovalPauseReason({ type: 'tool_call_limit', maxToolCalls: 25 })).toBe(false)
    expect(isApprovalPauseReason(undefined)).toBe(false)
  })
})

describe('listPendingApprovalToolCalls', () => {
  it('collects approval-paused tool calls with message ids in order', () => {
    const messages: TestMessage[] = [
      {
        id: 'm1',
        contentParts: [
          { type: 'text', text: 'hello' },
          makeToolCallPart({
            toolCallId: 'tc-1',
            pauseReason: { type: 'user_exec_approval', command: 'rm -rf build' },
          }),
        ],
      },
      {
        id: 'm2',
        contentParts: [
          makeToolCallPart({
            toolCallId: 'tc-2',
            toolName: 'edit_file',
            pauseReason: { type: 'file_mutation_approval', title: 'Edit config', preview: '- a\n+ b' },
          }),
        ],
      },
    ]
    expect(listPendingApprovalToolCalls(messages)).toEqual([
      {
        messageId: 'm1',
        toolCallId: 'tc-1',
        pauseReason: { type: 'user_exec_approval', command: 'rm -rf build' },
      },
      {
        messageId: 'm2',
        toolCallId: 'tc-2',
        pauseReason: { type: 'file_mutation_approval', title: 'Edit config', preview: '- a\n+ b' },
      },
    ])
  })

  it('ignores non-approval pauses and settled tool calls', () => {
    const messages: TestMessage[] = [
      {
        id: 'm1',
        contentParts: [
          makeToolCallPart({ pauseReason: { type: 'tool_call_limit', maxToolCalls: 25 } }),
          makeToolCallPart({ toolCallId: 'tc-2', state: 'result' }),
          makeToolCallPart({ toolCallId: 'tc-3', pauseReason: undefined }),
        ],
      },
    ]
    expect(listPendingApprovalToolCalls(messages)).toEqual([])
  })

  it('caches per messages-array identity', () => {
    const messages: TestMessage[] = [
      {
        id: 'm1',
        contentParts: [makeToolCallPart({ pauseReason: { type: 'user_exec_approval', command: 'ls' } })],
      },
    ]
    expect(listPendingApprovalToolCalls(messages)).toBe(listPendingApprovalToolCalls(messages))
  })
})

describe('getApprovalPreview', () => {
  it('previews the command / file title / action title', () => {
    expect(getApprovalPreview({ type: 'user_exec_approval', command: 'ls -la' })).toBe('ls -la')
    expect(getApprovalPreview({ type: 'file_mutation_approval', title: 'Edit a.ts', preview: 'diff' })).toBe(
      'Edit a.ts'
    )
    expect(
      getApprovalPreview({
        type: 'app_action_approval',
        action: 'image.generate',
        title: 'Generate images',
        preview: '',
      })
    ).toBe('Generate images')
  })
})
