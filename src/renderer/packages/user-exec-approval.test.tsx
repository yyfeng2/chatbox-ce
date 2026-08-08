import { describe, expect, it, vi } from 'vitest'
import {
  FileMutationApprovalPausedError,
  requestFileMutationApproval,
  requestUserExecApproval,
  UserExecApprovalPausedError,
} from './user-exec-approval'

describe('persistent user approval pauses', () => {
  it('auto-approves read-only commands without pausing', async () => {
    await expect(requestUserExecApproval('tool-a', 'pwd')).resolves.toBe('whitelist')
  })

  it('throws a persistent pause error for privileged commands', async () => {
    await expect(requestUserExecApproval('tool-b', 'touch /tmp/b')).rejects.toBeInstanceOf(UserExecApprovalPausedError)
    try {
      await requestUserExecApproval('tool-b', 'touch /tmp/b')
      throw new Error('expected approval pause')
    } catch (error) {
      expect(error).toBeInstanceOf(UserExecApprovalPausedError)
      expect((error as UserExecApprovalPausedError).toolCallId).toBe('tool-b')
      expect((error as UserExecApprovalPausedError).command).toBe('touch /tmp/b')
    }
  })

  it('persists the generated command explanation on the pause error', async () => {
    try {
      await requestUserExecApproval('tool-d', 'rm -rf ./dist', {
        userContext: 'user asked to clean build output',
        generateExplanation: (_command, _userContext, onStream) => {
          onStream?.('partial explanation')
          return Promise.resolve({ explanation: 'final explanation', safe: false })
        },
      })
      throw new Error('expected approval pause')
    } catch (error) {
      expect(error).toBeInstanceOf(UserExecApprovalPausedError)
      expect((error as UserExecApprovalPausedError).explanation).toBe('final explanation')
      expect((error as UserExecApprovalPausedError).explanationError).toBeUndefined()
    }
  })

  it('auto-approves when the AI explanation judges the command safe', async () => {
    await expect(
      requestUserExecApproval('tool-safe-ai', 'touch /tmp/a', {
        userContext: 'user asked to create a temporary marker file',
        generateExplanation: () =>
          Promise.resolve({
            explanation: 'Creates the requested temporary marker file.\n✅ Safe and reversible.',
            safe: true,
          }),
      })
    ).resolves.toBe('ai')
  })

  it('never auto-approves a locally ineligible command', async () => {
    await expect(
      requestUserExecApproval('tool-ineligible-ai', 'rm -rf ./dist', {
        userContext: 'user asked to remove build output',
        generateExplanation: () =>
          Promise.resolve({
            explanation: 'Deletes build output.\n✅ Requested cleanup.',
            safe: true,
          }),
      })
    ).rejects.toBeInstanceOf(UserExecApprovalPausedError)
  })

  it('propagates cancellation instead of converting it to an approval pause', async () => {
    const controller = new AbortController()
    controller.abort()
    const generateExplanation = vi.fn()

    await expect(
      requestUserExecApproval(
        'tool-aborted-ai',
        'touch /tmp/a',
        { userContext: 'create a marker', generateExplanation },
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(generateExplanation).not.toHaveBeenCalled()
  })

  it('keeps approval paused when the AI assessment requires review or fails', async () => {
    await expect(
      requestUserExecApproval('tool-cautious-ai', 'rm -rf ./dist', {
        userContext: 'user asked to inspect build output',
        generateExplanation: () =>
          Promise.resolve({
            explanation: 'Deletes the build output directory.\n⚠️ Destructive file change.',
            safe: false,
          }),
      })
    ).rejects.toBeInstanceOf(UserExecApprovalPausedError)

    try {
      await requestUserExecApproval('tool-failed-ai', 'touch /tmp/b', {
        userContext: 'user asked to create a temporary marker file',
        generateExplanation: () => Promise.reject(new Error('invalid tool call')),
      })
      throw new Error('expected approval pause')
    } catch (error) {
      expect(error).toBeInstanceOf(UserExecApprovalPausedError)
      expect((error as UserExecApprovalPausedError).explanationError).toBe(true)
    }
  })

  it('does not recover an empty structured explanation from a stream callback', async () => {
    try {
      await requestUserExecApproval('tool-empty-ai', 'touch /tmp/b', {
        userContext: 'user asked to create a temporary marker file',
        generateExplanation: (_command, _userContext, onStream) => {
          onStream?.('partial explanation')
          return Promise.resolve({ explanation: '', safe: true })
        },
      })
      throw new Error('expected approval pause')
    } catch (error) {
      expect(error).toBeInstanceOf(UserExecApprovalPausedError)
      expect((error as UserExecApprovalPausedError).explanation).toBeUndefined()
    }
  })

  it('throws a persistent pause error for real file mutations', () => {
    expect(() => requestFileMutationApproval('tool-c', 'Write file: /tmp/a.txt', 'hello')).toThrow(
      FileMutationApprovalPausedError
    )

    try {
      void requestFileMutationApproval('tool-c', 'Write file: /tmp/a.txt', 'hello')
      throw new Error('expected approval pause')
    } catch (error) {
      expect(error).toBeInstanceOf(FileMutationApprovalPausedError)
      expect((error as FileMutationApprovalPausedError).toolCallId).toBe('tool-c')
      expect((error as FileMutationApprovalPausedError).title).toBe('Write file: /tmp/a.txt')
      expect((error as FileMutationApprovalPausedError).preview).toBe('hello')
    }
  })
})
