import { describe, expect, it, vi } from 'vitest'
import {
  AgentModeRewardResumeError,
  ClaimFreeAgentModeRewardResponseSchema,
  claimAgentModeRewardAndResume,
} from './agent-mode-reward'

describe('ClaimFreeAgentModeRewardResponseSchema', () => {
  it('parses the backend response into UI-friendly fields', () => {
    expect(
      ClaimFreeAgentModeRewardResponseSchema.parse({
        data: {
          token_limit: 200000,
          expires_at: '2026-08-03T12:00:00.000000+08:00',
        },
      })
    ).toEqual({
      tokenLimit: 200000,
      expiresAt: '2026-08-03T12:00:00.000000+08:00',
    })
  })

  it('rejects an unusable reward response', () => {
    expect(() => ClaimFreeAgentModeRewardResponseSchema.parse({ data: { token_limit: 0, expires_at: '' } })).toThrow()
  })
})

describe('claimAgentModeRewardAndResume', () => {
  it('shows success before automatically resuming the interrupted task', async () => {
    const calls: string[] = []
    const reward = { tokenLimit: 200000, expiresAt: '2026-08-03T12:00:00+08:00' }

    await claimAgentModeRewardAndResume({
      claim: vi.fn(async () => reward),
      showSuccess: vi.fn(() => calls.push('success')),
      resume: vi.fn(() => {
        calls.push('resume')
        return Promise.resolve()
      }),
    })

    expect(calls).toEqual(['success', 'resume'])
  })

  it('does not resume when claiming fails', async () => {
    const resume = vi.fn()

    await expect(
      claimAgentModeRewardAndResume({
        claim: vi.fn(() => Promise.reject(new Error('claim failed'))),
        showSuccess: vi.fn(),
        resume,
      })
    ).rejects.toThrow('claim failed')
    expect(resume).not.toHaveBeenCalled()
  })

  it('distinguishes an automatic resume failure from a claim failure', async () => {
    const reward = { tokenLimit: 200000, expiresAt: '2026-08-03T12:00:00+08:00' }
    const resumeCause = new Error('resume failed')

    await expect(
      claimAgentModeRewardAndResume({
        claim: vi.fn(async () => reward),
        showSuccess: vi.fn(),
        resume: vi.fn(() => Promise.reject(resumeCause)),
      })
    ).rejects.toMatchObject({
      name: AgentModeRewardResumeError.name,
      reward,
      resumeCause,
    })
  })
})
