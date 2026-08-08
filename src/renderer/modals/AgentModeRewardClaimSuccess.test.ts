// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { formatRewardClaimDetails } from './AgentModeRewardClaimSuccess'

describe('formatRewardClaimDetails', () => {
  it('formats the reward amount and expiry for the active locale', () => {
    const result = formatRewardClaimDetails({
      tokenLimit: 200000,
      expiresAt: '2026-08-03T12:00:00.000000+08:00',
      language: 'zh-Hans',
    })

    expect(result.points).toBe('200,000')
    expect(result.expiry).toContain('2026')
  })

  it('keeps the backend expiry text if the timestamp is invalid', () => {
    expect(formatRewardClaimDetails({ tokenLimit: 1, expiresAt: 'later', language: 'en' }).expiry).toBe('later')
  })
})
