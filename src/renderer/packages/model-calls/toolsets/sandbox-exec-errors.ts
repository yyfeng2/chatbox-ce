import type { SandboxExecErrorCode, SandboxExecResult } from '@shared/sandbox-provider'

export interface SandboxExecToolError {
  error: string
  errorCode?: SandboxExecErrorCode
}

/** Preserve machine-readable sandbox failures while keeping a useful human/model fallback. */
export function sandboxExecToolError(result: SandboxExecResult, fallback: string): SandboxExecToolError {
  return {
    error: result.stderr || result.stdout || fallback,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  }
}
