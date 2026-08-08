/** Audit metadata only; it must never be used to grant execution permission. */
export type UserExecApprovalSource = 'whitelist' | 'ai' | 'user' | 'full_access'
