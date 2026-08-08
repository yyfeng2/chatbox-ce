import { describe, expect, it } from 'vitest'
import { getMigrationErrorContext, withMigrationErrorContext } from './migration-error'

describe('migration error context', () => {
  it('preserves the original error and records the failed migration step', async () => {
    const originalError = new Error('migration failed')
    let caughtError: unknown

    try {
      await withMigrationErrorContext({ configVersion: 14, targetConfigVersion: 15 }, () =>
        Promise.reject(originalError)
      )
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBe(originalError)
    expect(getMigrationErrorContext(caughtError)).toEqual({
      configVersion: 14,
      targetConfigVersion: 15,
    })
  })

  it('does not add context when the operation succeeds', async () => {
    const result = await withMigrationErrorContext({ configVersion: 14, targetConfigVersion: 15 }, () =>
      Promise.resolve('ok')
    )

    expect(result).toBe('ok')
  })
})
