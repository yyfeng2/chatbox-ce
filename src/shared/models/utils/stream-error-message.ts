/**
 * Extract a human-readable message from AI SDK stream error payloads.
 * Mid-stream provider errors are often plain objects (`{ message, type, code }`)
 * rather than Error instances; stringifying them yields "[object Object]".
 */
export function extractStreamErrorMessage(error: unknown): string {
  if (error == null) {
    return 'Unknown error'
  }
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.message === 'string' && record.message) {
      return record.message
    }
    const nested = record.error
    if (nested && typeof nested === 'object') {
      const nestedMessage = (nested as Record<string, unknown>).message
      if (typeof nestedMessage === 'string' && nestedMessage) {
        return nestedMessage
      }
    }
    try {
      return JSON.stringify(error)
    } catch {
      // fall through
    }
  }
  return String(error)
}
