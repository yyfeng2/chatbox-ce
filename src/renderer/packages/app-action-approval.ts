import type { AppActionApprovalDetails } from '@shared/types'

/**
 * Approval pause for Chatbox-owned state changes and potentially billable actions.
 * Agent Full Access does not bypass this boundary.
 */
export class AppActionApprovalPausedError extends Error {
  readonly kind = 'app-action'

  constructor(
    readonly toolCallId: string,
    readonly action: string,
    readonly title: string,
    readonly preview: string,
    readonly details?: AppActionApprovalDetails
  ) {
    super(`User approval required before running Chatbox action: ${action}`)
    this.name = 'AppActionApprovalPausedError'
  }
}

export function requestAppActionApproval(
  toolCallId: string,
  action: string,
  title: string,
  preview: string,
  details?: AppActionApprovalDetails
): Promise<boolean> {
  throw new AppActionApprovalPausedError(toolCallId, action, title, preview, details)
}
