import { z } from 'zod'

export const ClaimFreeAgentModeRewardResponseSchema = z
  .object({
    data: z.object({
      token_limit: z.number().positive(),
      expires_at: z.string().min(1),
    }),
  })
  .transform((response) => ({
    tokenLimit: response.data.token_limit,
    expiresAt: response.data.expires_at,
  }))

export type ClaimedAgentModeReward = z.infer<typeof ClaimFreeAgentModeRewardResponseSchema>

export class AgentModeRewardResumeError extends Error {
  constructor(
    public readonly reward: ClaimedAgentModeReward,
    public readonly resumeCause: unknown
  ) {
    super('The Agent Mode reward was claimed, but the interrupted task could not resume')
    this.name = 'AgentModeRewardResumeError'
  }
}

export async function claimAgentModeRewardAndResume({
  claim,
  showSuccess,
  resume,
}: {
  claim: () => Promise<ClaimedAgentModeReward>
  showSuccess: (reward: ClaimedAgentModeReward) => void
  resume: () => Promise<void>
}): Promise<ClaimedAgentModeReward> {
  const reward = await claim()
  showSuccess(reward)
  try {
    await resume()
  } catch (error) {
    throw new AgentModeRewardResumeError(reward, error)
  }
  return reward
}
