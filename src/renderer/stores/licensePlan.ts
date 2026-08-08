import type { ChatboxAILicenseDetail, ChatboxAIPlanType } from '@shared/types'

type LicensePlanSource = Pick<ChatboxAILicenseDetail, 'name' | 'plan'> | null | undefined

const LOW_TIER_PLANS = new Set<ChatboxAIPlanType>(['free', 'lite'])
const PRO_PLANS = new Set<ChatboxAIPlanType>(['pro', 'pro_plus'])

function getLegacyPlanName(detail?: LicensePlanSource, fallbackPlanName?: string): string {
  return (detail?.name || fallbackPlanName || '').toLowerCase()
}

export function isChatboxAIPlanFree(detail?: LicensePlanSource, fallbackPlanName?: string): boolean {
  if (detail?.plan) {
    return detail.plan === 'free'
  }
  return getLegacyPlanName(detail, fallbackPlanName) === 'chatbox ai free'
}

export function isChatboxAILowTierPlan(detail?: LicensePlanSource, fallbackPlanName?: string): boolean {
  if (detail?.plan) {
    return LOW_TIER_PLANS.has(detail.plan)
  }

  const planName = getLegacyPlanName(detail, fallbackPlanName)
  return !planName || planName.includes('free') || planName.includes('lite')
}

export function isChatboxAIProPlan(detail?: LicensePlanSource, fallbackPlanName?: string): boolean {
  if (detail?.plan) {
    return PRO_PLANS.has(detail.plan)
  }

  const planName = getLegacyPlanName(detail, fallbackPlanName)
  return Boolean(planName) && !planName.includes('free') && !planName.includes('lite')
}
