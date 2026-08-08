import { describe, expect, it } from 'vitest'
import { areSessionsInSamePinGroup } from './session-sort'

describe('areSessionsInSamePinGroup', () => {
  it('treats false and undefined as the same unpinned group', () => {
    expect(areSessionsInSamePinGroup({ starred: false }, {})).toBe(true)
  })

  it('keeps pinned and unpinned sessions in different groups', () => {
    expect(areSessionsInSamePinGroup({ starred: true }, { starred: false })).toBe(false)
    expect(areSessionsInSamePinGroup({ starred: true }, {})).toBe(false)
  })

  it('returns false when either session is missing', () => {
    expect(areSessionsInSamePinGroup(undefined, {})).toBe(false)
    expect(areSessionsInSamePinGroup({}, undefined)).toBe(false)
  })
})
