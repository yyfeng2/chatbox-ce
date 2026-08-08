/**
 * Thinking-budget presets shared by the renderer SessionSettings modal and the
 * native session settings sheet, so both surfaces map budget tokens to the
 * same Low/Medium/High choices.
 */
export const THINKING_BUDGET_PRESETS: number[] = [2048, 5120, 10240]

export type ThinkingBudgetChoice = 'disabled' | 'custom' | '2048' | '5120' | '10240'

export function toThinkingChoice(enabled: boolean, budgetTokens: number): ThinkingBudgetChoice {
  if (!enabled) return 'disabled'
  return THINKING_BUDGET_PRESETS.includes(budgetTokens) ? (String(budgetTokens) as ThinkingBudgetChoice) : 'custom'
}

export function fromThinkingChoice(choice: ThinkingBudgetChoice, customValue: string, fallback: number): number {
  if (choice === 'custom') {
    const parsed = Number(customValue)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
  }
  return choice === 'disabled' ? 0 : Number(choice)
}
