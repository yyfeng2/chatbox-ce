import type { SessionSettings, Settings } from '../types'

/**
 * How many consecutive tool calls a generation may execute before pausing for
 * user confirmation (the "Paused after N steps" card).
 */
export const MAX_TOOL_CALLS_BEFORE_CONFIRMATION = 25

/**
 * Resolve whether generation should pause for confirmation after
 * MAX_TOOL_CALLS_BEFORE_CONFIRMATION consecutive tool calls.
 * The session-level setting overrides the global one; the default is to pause.
 */
export function shouldPauseOnToolCallLimit(
  sessionSettings: Pick<SessionSettings, 'pauseOnToolCallLimit'> | undefined,
  globalSettings: Partial<Pick<Settings, 'pauseOnToolCallLimit'>> | undefined
): boolean {
  return sessionSettings?.pauseOnToolCallLimit ?? globalSettings?.pauseOnToolCallLimit ?? true
}
