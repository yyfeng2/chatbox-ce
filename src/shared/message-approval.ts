import type { Message, MessageToolCallPart } from './types'

// Single source of truth for "this tool call is paused waiting for user approval".
// Everything that reacts to a pending approval (input locking, the floating pill,
// orchestration resume batches, the approval card UI) must route through this module
// so a new approval pause type only ever needs to be added here.

export type ApprovalPauseReason = Extract<
  NonNullable<MessageToolCallPart['pauseReason']>,
  { type: 'user_exec_approval' | 'file_mutation_approval' | 'app_action_approval' }
>

export type PendingApprovalToolCall = {
  messageId: string
  toolCallId: string
  pauseReason: ApprovalPauseReason
}

export function isApprovalPauseReason(
  pauseReason: MessageToolCallPart['pauseReason']
): pauseReason is ApprovalPauseReason {
  return (
    pauseReason?.type === 'user_exec_approval' ||
    pauseReason?.type === 'file_mutation_approval' ||
    pauseReason?.type === 'app_action_approval'
  )
}

type ApprovalScanMessage = Pick<Message, 'id' | 'contentParts'>

// The message list identity changes on every streaming chunk and several consumers
// (input box, floating pill) scan it in the same render pass — cache per array
// identity so the walk happens once per update.
const pendingApprovalsCache = new WeakMap<object, PendingApprovalToolCall[]>()

/** All tool calls currently paused waiting for user approval, in message order. */
export function listPendingApprovalToolCalls(messages: ApprovalScanMessage[]): PendingApprovalToolCall[] {
  const cached = pendingApprovalsCache.get(messages)
  if (cached) return cached

  const pending: PendingApprovalToolCall[] = []
  for (const message of messages) {
    for (const part of message.contentParts) {
      if (part.type === 'tool-call' && part.state === 'paused' && isApprovalPauseReason(part.pauseReason)) {
        pending.push({
          messageId: message.id,
          toolCallId: part.toolCallId,
          pauseReason: part.pauseReason,
        })
      }
    }
  }
  pendingApprovalsCache.set(messages, pending)
  return pending
}

/** One-line preview of what the approval is about (command / file / action title). */
export function getApprovalPreview(pauseReason: ApprovalPauseReason): string {
  switch (pauseReason.type) {
    case 'user_exec_approval':
      return pauseReason.command
    case 'file_mutation_approval':
    case 'app_action_approval':
      return pauseReason.title
  }
}
