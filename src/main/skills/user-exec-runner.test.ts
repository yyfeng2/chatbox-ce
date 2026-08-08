import { describe, expect, it, vi } from 'vitest'
import {
  cancelUserExecCommand,
  createUserExecRunner,
  executeUserExecCommand,
  type UserExecResult,
} from './user-exec-runner'

const SUCCESS_RESULT: UserExecResult = { success: true, stdout: 'ok', stderr: '', exitCode: 0 }

describe('createUserExecRunner', () => {
  it('deduplicates concurrent and completed calls in one main-process lifetime', async () => {
    const execute = vi.fn(async () => SUCCESS_RESULT)
    const runner = createUserExecRunner(execute)
    const params = { command: 'touch /tmp/a', sessionId: 'session-a', toolCallId: 'tool-a' }

    const first = runner.run(params)
    const second = runner.run(params)
    await expect(Promise.all([first, second])).resolves.toEqual([SUCCESS_RESULT, SUCCESS_RESULT])
    await expect(runner.run(params)).resolves.toEqual(SUCCESS_RESULT)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('rejects a reused identity with a different command', async () => {
    const execute = vi.fn(async () => SUCCESS_RESULT)
    const runner = createUserExecRunner(execute)

    await runner.run({ command: 'touch /tmp/a', sessionId: 'session-a', toolCallId: 'tool-a' })
    await expect(
      runner.run({ command: 'touch /tmp/b', sessionId: 'session-a', toolCallId: 'tool-a' })
    ).resolves.toMatchObject({ success: false, stderr: expect.stringContaining('different command') })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('rejects a reused identity with a different working directory', async () => {
    const execute = vi.fn(async () => SUCCESS_RESULT)
    const runner = createUserExecRunner(execute)

    await runner.run({ command: 'git status', cwd: 'C:\\repo-a', sessionId: 'session-a', toolCallId: 'tool-a' })
    await expect(
      runner.run({ command: 'git status', cwd: 'C:\\repo-b', sessionId: 'session-a', toolCallId: 'tool-a' })
    ).resolves.toMatchObject({
      success: false,
      stderr: expect.stringContaining('different command or working directory'),
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('does not deduplicate calls without a toolCallId', async () => {
    const execute = vi.fn(async () => SUCCESS_RESULT)
    const runner = createUserExecRunner(execute)

    await runner.run({ command: 'touch /tmp/a' })
    await runner.run({ command: 'touch /tmp/a' })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('prunes completed entries after the TTL without evicting in-flight calls', async () => {
    let currentTime = 0
    let finish: ((result: UserExecResult) => void) | undefined
    const execute = vi
      .fn<() => Promise<UserExecResult>>()
      .mockImplementationOnce(
        () =>
          new Promise<UserExecResult>((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue(SUCCESS_RESULT)
    const runner = createUserExecRunner(execute, { completedTtlMs: 100, now: () => currentTime })
    const params = { command: 'touch /tmp/a', sessionId: 'session-a', toolCallId: 'tool-a' }

    const first = runner.run(params)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    currentTime = 200
    const duplicateWhileRunning = runner.run(params)
    expect(execute).toHaveBeenCalledTimes(1)
    finish?.(SUCCESS_RESULT)
    await Promise.all([first, duplicateWhileRunning])
    expect(execute).toHaveBeenCalledTimes(1)

    currentTime = 301
    await runner.run(params)
    expect(execute).toHaveBeenCalledTimes(2)
  })
})

describe.skipIf(process.platform === 'win32')('user_exec cancellation', () => {
  it('terminates a running command by session and tool-call identity', async () => {
    const params = {
      command: `printf 'started\\n'; sleep 30`,
      sessionId: 'cancel-session',
      toolCallId: 'cancel-tool',
    }
    const execution = executeUserExecCommand(params)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(cancelUserExecCommand(params)).toEqual({ killed: true })
    await expect(execution).resolves.toMatchObject({
      success: false,
      stderr: '',
      exitCode: 130,
      cancelled: true,
    })
    expect(cancelUserExecCommand(params)).toEqual({ killed: false })
  })
})
