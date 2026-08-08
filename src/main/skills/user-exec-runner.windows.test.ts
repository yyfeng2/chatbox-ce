import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../util', () => ({
  getLogger: () => logger,
}))

import { executeUserExecCommand } from './user-exec-runner'

describe.skipIf(process.platform !== 'win32')('user_exec on native Windows', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'chatbox user exec 中文-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  test('runs PowerShell from stdin in the requested working directory', async () => {
    const marker = 'user-exec-PowerShell-中文'
    const result = await executeUserExecCommand({
      command: [
        `$marker = '${marker}'`,
        "[IO.File]::WriteAllText('user-exec-marker.txt', $marker, [Text.UTF8Encoding]::new($false))",
        '[Console]::Out.WriteLine((Get-Location).Path)',
        '[Console]::Out.Write($marker)',
      ].join('\n'),
      cwd: workDir,
    })

    const [reportedCwd, reportedMarker] = result.stdout.trim().split(/\r?\n/, 2)
    expect(result).toMatchObject({ success: true, stderr: '', exitCode: 0 })
    expect(path.win32.normalize(realpathSync.native(reportedCwd)).toLowerCase()).toBe(
      path.win32.normalize(realpathSync.native(workDir)).toLowerCase()
    )
    expect(reportedMarker).toBe(marker)
    const outputPath = path.join(workDir, 'user-exec-marker.txt')
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toBe(marker)
  })

  test('preserves a non-zero PowerShell exit code', async () => {
    await expect(executeUserExecCommand({ command: 'exit 7', cwd: workDir })).resolves.toMatchObject({
      success: false,
      stdout: '',
      stderr: '',
      exitCode: 7,
    })
  })
})
