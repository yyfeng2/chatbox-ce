import { describe, expect, it } from 'vitest'
import { shouldPauseOnToolCallLimit } from './tool-call-limit-pause'

describe('shouldPauseOnToolCallLimit', () => {
  it('pauses by default when neither setting is present', () => {
    expect(shouldPauseOnToolCallLimit(undefined, undefined)).toBe(true)
    expect(shouldPauseOnToolCallLimit({}, {})).toBe(true)
    expect(shouldPauseOnToolCallLimit({ pauseOnToolCallLimit: undefined }, { pauseOnToolCallLimit: undefined })).toBe(
      true
    )
  })

  it('follows the global setting when the session does not override it', () => {
    expect(shouldPauseOnToolCallLimit({}, { pauseOnToolCallLimit: false })).toBe(false)
    expect(shouldPauseOnToolCallLimit({}, { pauseOnToolCallLimit: true })).toBe(true)
    expect(shouldPauseOnToolCallLimit(undefined, { pauseOnToolCallLimit: false })).toBe(false)
  })

  it('lets the session setting override the global one in both directions', () => {
    expect(shouldPauseOnToolCallLimit({ pauseOnToolCallLimit: false }, { pauseOnToolCallLimit: true })).toBe(false)
    expect(shouldPauseOnToolCallLimit({ pauseOnToolCallLimit: true }, { pauseOnToolCallLimit: false })).toBe(true)
    expect(shouldPauseOnToolCallLimit({ pauseOnToolCallLimit: false }, undefined)).toBe(false)
  })
})
