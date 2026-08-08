import { spawn } from 'node:child_process'
import os from 'node:os'
import type { UserExecApprovalSource } from '@shared/types/user-exec'
import { buildOperationFinishLog, buildOperationStartLog, createOperationId } from '../operation-log'
import { killProcessTree } from '../process-tree'
import { buildPowerShellStdinScript } from '../sandbox/exec-script'
import { getLogger } from '../util'
import { resolveWindowsPowerShell } from '../windows-powershell'

const log = getLogger('skills:user-exec')

export interface UserExecParams {
  command: string
  cwd?: string
  timeout?: number
  sessionId?: string
  toolCallId?: string
  approvalSource?: UserExecApprovalSource
}

export interface UserExecResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  cancelled?: boolean
}

interface ActiveUserExecCommand {
  cancel: () => void
}

interface UserExecEntry {
  command: string
  cwd?: string
  promise: Promise<UserExecResult>
  completedAt?: number
}

interface UserExecRunnerOptions {
  completedTtlMs?: number
  maxCompletedEntries?: number
  now?: () => number
}

const DEFAULT_COMPLETED_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_COMPLETED_ENTRIES = 32
const activeUserExecCommands = new Map<string, ActiveUserExecCommand>()

function getUserExecKey(sessionId: string | undefined, toolCallId: string | undefined): string | null {
  return toolCallId ? `${sessionId ?? ''}:${toolCallId}` : null
}

export function cancelUserExecCommand(params: Pick<UserExecParams, 'sessionId' | 'toolCallId'>): { killed: boolean } {
  const key = getUserExecKey(params.sessionId, params.toolCallId)
  const active = key ? activeUserExecCommands.get(key) : undefined
  if (!active) return { killed: false }
  active.cancel()
  return { killed: true }
}

export async function executeUserExecCommand(params: UserExecParams): Promise<UserExecResult> {
  const { command, cwd: requestedCwd, timeout, sessionId, toolCallId, approvalSource } = params

  try {
    if (!command || typeof command !== 'string') throw new Error('Command is required')

    const homeDir = os.homedir()
    const cwd = requestedCwd?.trim() || homeDir
    const timeoutMs = timeout || 120_000
    const maxOutputBytes = 1024 * 1024 // 1MB
    const operationId = createOperationId()
    const startedAt = Date.now()

    log.info(
      buildOperationStartLog({
        operationId,
        kind: 'user_exec',
        sessionId,
        toolCallId,
        // Renderer approval metadata is audit-only. Missing values remain visible
        // instead of silently looking like a known authorization path.
        approvalSource: approvalSource ?? 'unknown',
        cwd,
        timeoutMs,
        command,
      })
    )

    const isWindows = process.platform === 'win32'
    const powershell = isWindows ? resolveWindowsPowerShell() : null
    if (isWindows && !powershell) {
      const result = {
        success: false,
        stdout: '',
        stderr: 'PowerShell is not available on this Windows host.',
        exitCode: null,
      }
      log.warn(
        buildOperationFinishLog({
          operationId,
          success: false,
          exitCode: null,
          durationMs: Date.now() - startedAt,
          stdout: '',
          stderr: result.stderr,
        })
      )
      return result
    }
    const shellCommand = powershell?.cmd ?? 'bash'
    const shellArgs = powershell?.args ?? ['-lc', command]

    return await new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let stdoutBytes = 0
      let stderrBytes = 0
      let settled = false
      let cancelled = false
      let forceKillHandle: ReturnType<typeof setTimeout> | undefined
      const activeKey = getUserExecKey(sessionId, toolCallId)

      const resolveOnce = (result: UserExecResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutHandle)
        if (activeKey) activeUserExecCommands.delete(activeKey)
        const finishLog = buildOperationFinishLog({
          operationId,
          success: result.success,
          exitCode: result.exitCode,
          durationMs: Date.now() - startedAt,
          timedOut: result.exitCode === null && result.stderr.includes('timed out'),
          stdout: result.stdout,
          stderr: result.stderr,
          stdoutBytes,
          stderrBytes,
        })
        if (result.success) log.info(finishLog)
        else log.warn(finishLog)
        resolve(result)
      }

      const child = spawn(shellCommand, shellArgs, {
        cwd,
        stdio: [isWindows ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        env: process.env,
        shell: false,
        // Keep the command in its own POSIX process group so cancellation also
        // terminates descendants. Windows uses taskkill /T in killProcessTree.
        detached: !isWindows,
      })

      if (activeKey) {
        activeUserExecCommands.set(activeKey, {
          cancel: () => {
            if (settled || cancelled) return
            cancelled = true
            clearTimeout(timeoutHandle)
            killProcessTree(child, 'SIGTERM')
            forceKillHandle = setTimeout(() => killProcessTree(child, 'SIGKILL'), 3_000)
          },
        })
      }

      const timeoutHandle = setTimeout(() => {
        if (settled || child.killed) return
        killProcessTree(child, 'SIGTERM')
        forceKillHandle = setTimeout(() => killProcessTree(child, 'SIGKILL'), 3_000)
        resolveOnce({
          success: false,
          stdout,
          stderr: stderr || `Command timed out (${timeoutMs / 1000}s)`,
          exitCode: null,
        })
      }, timeoutMs)

      if (!child.stdout || !child.stderr) {
        child.kill('SIGTERM')
        resolveOnce({ success: false, stdout: '', stderr: 'Command output streams are unavailable', exitCode: null })
        return
      }

      if (isWindows && child.stdin) {
        child.stdin.on('error', () => {
          // The process error/close handlers below own the final result.
        })
        child.stdin.end(buildPowerShellStdinScript(command), 'utf8')
      }

      child.stdout.on('data', (data: Buffer) => {
        stdoutBytes += data.byteLength
        if (stdoutBytes <= maxOutputBytes) stdout += data.toString()
      })
      child.stderr.on('data', (data: Buffer) => {
        stderrBytes += data.byteLength
        if (stderrBytes <= maxOutputBytes) stderr += data.toString()
      })
      child.on('error', (error) => {
        if (forceKillHandle) clearTimeout(forceKillHandle)
        log.error('skills:user-exec spawn error', error)
        resolveOnce({ success: false, stdout, stderr: stderr || error.message, exitCode: null })
      })
      child.on('close', (code, signal) => {
        if (forceKillHandle) clearTimeout(forceKillHandle)
        resolveOnce(
          cancelled
            ? { success: false, stdout, stderr, exitCode: 130, cancelled: true }
            : signal === 'SIGTERM'
              ? { success: false, stdout, stderr: stderr || 'Command timed out', exitCode: null }
              : { success: code === 0, stdout, stderr, exitCode: code }
        )
      })
    })
  } catch (error) {
    log.error('skills:user-exec failed', error)
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: null,
    }
  }
}

export function createUserExecRunner(
  execute: (params: UserExecParams) => Promise<UserExecResult>,
  options: UserExecRunnerOptions = {}
) {
  const completedTtlMs = options.completedTtlMs ?? DEFAULT_COMPLETED_TTL_MS
  const maxCompletedEntries = options.maxCompletedEntries ?? DEFAULT_MAX_COMPLETED_ENTRIES
  const now = options.now ?? Date.now
  const entries = new Map<string, UserExecEntry>()

  function pruneCompletedEntries(): void {
    const currentTime = now()
    for (const [key, entry] of entries) {
      if (entry.completedAt !== undefined && currentTime - entry.completedAt >= completedTtlMs) {
        entries.delete(key)
      }
    }

    const completedEntries = [...entries.entries()]
      .filter((entry): entry is [string, UserExecEntry & { completedAt: number }] => entry[1].completedAt !== undefined)
      .sort((a, b) => a[1].completedAt - b[1].completedAt)
    for (const [key] of completedEntries.slice(0, Math.max(0, completedEntries.length - maxCompletedEntries))) {
      entries.delete(key)
    }
  }

  return {
    run(params: UserExecParams): Promise<UserExecResult> {
      if (!params.toolCallId) return execute(params)

      pruneCompletedEntries()
      const key = `${params.sessionId ?? ''}:${params.toolCallId}`
      const existing = entries.get(key)
      if (existing) {
        if (existing.command !== params.command || existing.cwd !== params.cwd) {
          return Promise.resolve({
            success: false,
            stdout: '',
            stderr: `Tool call ${params.toolCallId} was reused with a different command or working directory`,
            exitCode: null,
          })
        }
        return existing.promise
      }

      const entry: UserExecEntry = {
        command: params.command,
        cwd: params.cwd,
        promise: Promise.resolve().then(() => execute(params)),
      }
      entries.set(key, entry)
      const markCompleted = () => {
        entry.completedAt = now()
        pruneCompletedEntries()
      }
      void entry.promise.then(markCompleted, markCompleted)
      return entry.promise
    },
  }
}

export function createDefaultUserExecRunner() {
  return createUserExecRunner(executeUserExecCommand)
}
