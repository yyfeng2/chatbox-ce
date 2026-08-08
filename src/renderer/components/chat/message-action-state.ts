import type { SessionType } from '@shared/types'

export type MessageButtonGroup = 'auto' | 'always' | 'none'

export function getMessageActionVisibilityClass(isVisible: boolean): string {
  if (isVisible) {
    return 'visible opacity-100 pointer-events-auto'
  }
  return [
    'invisible opacity-0 pointer-events-none',
    'group-hover/message:visible group-hover/message:opacity-100 group-hover/message:pointer-events-auto',
  ].join(' ')
}

export function shouldShowConcurrentReplyStop(options: {
  /**
   * Explicit opt-in used by fork-group alternatives. The active reply in the
   * main list must stay button-free while generating; it is stopped from the
   * input box instead.
   */
  allowStop: boolean
  cancellable: boolean
  generatingReplyCount: number
  sessionType: SessionType
}): boolean {
  return (
    options.allowStop && options.cancellable && options.generatingReplyCount > 1 && options.sessionType !== 'picture'
  )
}
