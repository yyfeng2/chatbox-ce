import { describe, expect, it } from 'vitest'
import { extractStreamErrorMessage } from './stream-error-message'

describe('extractStreamErrorMessage', () => {
  it('returns string errors as-is', () => {
    expect(extractStreamErrorMessage('boom')).toBe('boom')
  })

  it('returns Error.message', () => {
    expect(extractStreamErrorMessage(new Error('network down'))).toBe('network down')
  })

  it('extracts message from plain provider error objects', () => {
    expect(
      extractStreamErrorMessage({
        message: 'The server was restarted during this response. Please retry to continue.',
        type: 'server_error',
        code: 'server_shutdown',
      })
    ).toBe('The server was restarted during this response. Please retry to continue.')
  })

  it('extracts nested error.message (Anthropic shape)', () => {
    expect(
      extractStreamErrorMessage({
        type: 'error',
        error: { type: 'overloaded_error', message: 'please retry' },
      })
    ).toBe('please retry')
  })

  it('falls back to JSON for objects without message', () => {
    expect(extractStreamErrorMessage({ code: 'x' })).toBe('{"code":"x"}')
  })
})
