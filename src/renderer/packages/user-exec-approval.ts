/** User exec approval assessment and persistent-pause errors. */

import type { UserExecApprovalSource } from '@shared/types/user-exec'
import type { CommandExplanationResult } from '@/packages/model-calls/command-explanation'
import { getAiAutoApprovalEligibility } from './user-exec-ai-policy'
import { isCommandAutoApprovable } from './user-exec-whitelist'

export interface ExplanationContext {
  userContext: string
  generateExplanation: (
    command: string,
    userContext: string,
    onStreamUpdate?: (text: string) => void,
    signal?: AbortSignal
  ) => Promise<CommandExplanationResult>
}

export class UserExecApprovalPausedError extends Error {
  readonly kind = 'command'

  constructor(
    readonly toolCallId: string,
    readonly command: string,
    readonly explanation?: string,
    readonly explanationError?: boolean
  ) {
    super(`User approval required before executing command: ${command}`)
    this.name = 'UserExecApprovalPausedError'
  }
}

export class FileMutationApprovalPausedError extends Error {
  readonly kind = 'file'

  constructor(
    readonly toolCallId: string,
    readonly title: string,
    readonly preview: string
  ) {
    super(`User approval required before mutating file: ${title}`)
    this.name = 'FileMutationApprovalPausedError'
  }
}

/** Evaluate whether a command can run automatically or must pause for user approval. */
const MAX_PERSISTED_EXPLANATION_LENGTH = 4000

async function generateApprovalAssessment(
  command: string,
  explanationCtx: ExplanationContext | undefined,
  signal?: AbortSignal
): Promise<{ explanation?: string; explanationError?: boolean; safe?: boolean }> {
  if (!explanationCtx) return {}

  try {
    throwIfAborted(signal)
    const result = await explanationCtx.generateExplanation(command, explanationCtx.userContext, undefined, signal)
    throwIfAborted(signal)
    return {
      explanation: result.explanation ? result.explanation.slice(0, MAX_PERSISTED_EXPLANATION_LENGTH) : undefined,
      safe: Boolean(result.explanation) && result.safe,
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    return { explanationError: true }
  }
}

export async function requestUserExecApproval(
  toolCallId: string,
  command: string,
  explanationCtx?: ExplanationContext,
  signal?: AbortSignal
): Promise<UserExecApprovalSource> {
  // Auto-approve safe read-only commands (no caching needed — idempotent)
  if (isCommandAutoApprovable(command)) {
    return 'whitelist'
  }

  const aiEligibility = getAiAutoApprovalEligibility(command)
  const { explanation, explanationError, safe } = await generateApprovalAssessment(command, explanationCtx, signal)
  if (aiEligibility.eligible && safe) return 'ai'

  throw new UserExecApprovalPausedError(toolCallId, command, explanation, explanationError)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function requestFileMutationApproval(toolCallId: string, title: string, preview: string): Promise<boolean> {
  throw new FileMutationApprovalPausedError(toolCallId, title, preview)
}
