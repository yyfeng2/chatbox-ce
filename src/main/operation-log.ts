import { createHash, randomUUID } from 'node:crypto'
import type { UserExecApprovalSource } from '@shared/types/user-exec'

const COMMAND_PREVIEW_CHARS = 500
const OUTPUT_PREVIEW_CHARS = 1500

export interface OperationStartRecord {
  operationId: string
  kind: 'sandbox_exec' | 'sandbox_exec_code' | 'user_exec'
  sessionId?: string
  toolCallId?: string
  approvalSource?: UserExecApprovalSource | 'unknown'
  cwd?: string
  timeoutMs?: number
  command?: string
  language?: string
  code?: string
}

export interface OperationFinishRecord {
  operationId: string
  success: boolean
  exitCode: number | null
  durationMs: number
  timedOut?: boolean
  stdout: string
  stderr: string
  stdoutBytes?: number
  stderrBytes?: number
}

export function createOperationId(): string {
  return randomUUID()
}

export function redactOperationText(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b((?:api[_-]?key|token|secret|password|authorization)|(?:[A-Za-z_][A-Za-z0-9_]*(?:_api[_-]?key|_token|_secret|_password|_authorization)[A-Za-z0-9_]*))\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&]+)/gi,
      '$1$2[REDACTED]'
    )
    .replace(/(--(?:api-key|token|secret|password|authorization)(?:=|\s+))("[^"]*"|'[^']*'|[^\s&]+)/gi, '$1[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED_KEY]')
}

export function operationTextPreview(text: string, maxChars: number): string {
  const redacted = redactOperationText(text)
  if (redacted.length <= maxChars) return redacted
  const headChars = Math.floor(maxChars * 0.35)
  const tailChars = maxChars - headChars
  return `${redacted.slice(0, headChars)}\n...[truncated ${redacted.length - maxChars} chars]...\n${redacted.slice(
    -tailChars
  )}`
}

export function buildOperationStartLog(record: OperationStartRecord): string {
  const commandOrCode = record.command ?? record.code ?? ''
  const payload = {
    operationId: record.operationId,
    kind: record.kind,
    sessionId: record.sessionId,
    toolCallId: record.toolCallId,
    approvalSource: record.approvalSource,
    cwd: record.cwd,
    timeoutMs: record.timeoutMs,
    language: record.language,
    commandHash: commandOrCode ? createHash('sha256').update(commandOrCode).digest('hex').slice(0, 16) : undefined,
    commandBytes: commandOrCode ? Buffer.byteLength(commandOrCode, 'utf-8') : undefined,
    commandPreview: commandOrCode ? operationTextPreview(commandOrCode, COMMAND_PREVIEW_CHARS) : undefined,
  }
  return `agent_operation start ${JSON.stringify(payload)}`
}

export function buildOperationFinishLog(record: OperationFinishRecord): string {
  const includeOutputPreview = !record.success || record.timedOut
  const payload = {
    operationId: record.operationId,
    success: record.success,
    exitCode: record.exitCode,
    durationMs: record.durationMs,
    timedOut: record.timedOut || undefined,
    stdoutBytes: record.stdoutBytes ?? Buffer.byteLength(record.stdout, 'utf-8'),
    stderrBytes: record.stderrBytes ?? Buffer.byteLength(record.stderr, 'utf-8'),
    stdoutPreview: includeOutputPreview ? operationTextPreview(record.stdout, OUTPUT_PREVIEW_CHARS) : undefined,
    stderrPreview: includeOutputPreview ? operationTextPreview(record.stderr, OUTPUT_PREVIEW_CHARS) : undefined,
  }
  return `agent_operation finish ${JSON.stringify(payload)}`
}
