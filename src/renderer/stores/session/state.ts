// Shared state for debouncing/deduplicating name generation requests.
// Isolated here to avoid circular imports between naming.ts and other session modules.

// Key format: `name-${sessionId}` or `thread-${sessionId}`
export const pendingNameGenerations = new Map<string, ReturnType<typeof setTimeout>>()
export const activeNameGenerations = new Set<string>()

/**
 * Streams whose Stop left a tool execution that ignores its abortSignal still running.
 * Generation entry points must wait for these to settle before executing tools — including
 * paths that intentionally bypass the session generation lock (alternative chat replies).
 */
const unsettledStreamDrains = new Map<string, Set<Promise<void>>>()

export function registerUnsettledStreamDrain(sessionId: string, drain: Promise<void>): void {
  let drains = unsettledStreamDrains.get(sessionId)
  if (!drains) {
    drains = new Set()
    unsettledStreamDrains.set(sessionId, drains)
  }
  drains.add(drain)
  const cleanup = () => {
    drains.delete(drain)
    if (drains.size === 0 && unsettledStreamDrains.get(sessionId) === drains) {
      unsettledStreamDrains.delete(sessionId)
    }
  }
  drain.then(cleanup, cleanup)
}

/** Resolves once every currently-registered unsettled stream for the session has drained. */
export function waitForUnsettledStreamDrains(sessionId: string): Promise<void> | undefined {
  const drains = unsettledStreamDrains.get(sessionId)
  if (!drains || drains.size === 0) return undefined
  return Promise.all([...drains]).then(() => {})
}
