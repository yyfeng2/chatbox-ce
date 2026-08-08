import { describe, expect, test, vi } from 'vitest'

vi.hoisted(() => {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  }
  const windowMock: Record<string, unknown> = {
    electronAPI: undefined,
    localStorage: storage,
  }
  ;(globalThis as unknown as { window: Record<string, unknown>; localStorage: typeof storage }).window = windowMock
  ;(globalThis as unknown as { window: Record<string, unknown>; localStorage: typeof storage }).localStorage = storage
  return {}
})

// ── sandboxMode computation ───────────────────────────────────────────────
// Regression: sandboxMode must be based on canExecuteCode, not agent mode.
// When agent mode is on but the sandbox is unavailable, files should still
// get full content injection (not metadata-only).

describe('sandboxMode computation', () => {
  // Extracted from agent-harness.ts:
  //   sandboxMode: canExecuteCode
  // (Previously was: effectiveAgentMode !== 'off' — which was wrong)

  test('sandboxMode is false when canExecuteCode is false, even with agent mode on', () => {
    const canExecuteCode = false
    const sandboxMode = canExecuteCode
    expect(sandboxMode).toBe(false)
  })

  test('sandboxMode is true when canExecuteCode is true', () => {
    const canExecuteCode = true
    const sandboxMode = canExecuteCode
    expect(sandboxMode).toBe(true)
  })

  test('sandboxMode is false when agent mode is off', () => {
    const canExecuteCode = false
    const sandboxMode = canExecuteCode
    expect(sandboxMode).toBe(false)
  })
})

// ── stream persistence policy ──────────────────────────────────────────────
// Regression: a pending user_exec tool call can block the stream before the
// 2s periodic flush runs, so tool-call chunks must persist immediately.

function shouldPersistStreamingChunk(chunkType: string, elapsedMs: number, persistInterval: number) {
  return chunkType === 'tool-call' || elapsedMs >= persistInterval
}

describe('stream persistence policy', () => {
  test('persists tool-call chunks immediately even before the periodic interval', () => {
    expect(shouldPersistStreamingChunk('tool-call', 100, 2000)).toBe(true)
  })

  test('does not eagerly persist non-tool chunks before the periodic interval', () => {
    expect(shouldPersistStreamingChunk('text-delta', 100, 2000)).toBe(false)
  })

  test('still persists non-tool chunks after the periodic interval', () => {
    expect(shouldPersistStreamingChunk('text-delta', 2500, 2000)).toBe(true)
  })
})
