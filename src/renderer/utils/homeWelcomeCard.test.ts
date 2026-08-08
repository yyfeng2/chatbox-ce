import { describe, expect, it } from 'vitest'

import { getHomeWelcomeCardMode } from './homeWelcomeCard'

describe('getHomeWelcomeCardMode', () => {
  it('returns "none" when providerCount > 0', () => {
    expect(
      getHomeWelcomeCardMode({
        providerCount: 1,
        isLoggedIn: false,
        hasLicense: false,
        hasExpiredLicense: false,
      })
    ).toBe('none')
  })

  it('returns "none" when hasLicense is true (even if not logged in)', () => {
    expect(
      getHomeWelcomeCardMode({
        providerCount: 0,
        isLoggedIn: false,
        hasLicense: true,
        hasExpiredLicense: false,
      })
    ).toBe('none')
  })

  it('returns "none" during store review even when login card would otherwise show', () => {
    expect(
      getHomeWelcomeCardMode({
        providerCount: 0,
        isLoggedIn: false,
        hasLicense: false,
        hasExpiredLicense: false,
        hideForStoreReview: true,
      })
    ).toBe('none')
  })
})
