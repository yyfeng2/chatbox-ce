import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { buildSandboxReadScript, SANDBOX_READ_MAX_CONTENT_BYTES } from './file-read'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('buildSandboxReadScript', () => {
  test('keeps encoded JSON below the exec output truncation threshold', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'chatbox-read-file-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'large.txt')
    const line = `${'x'.repeat(900)}\t${'\\"'.repeat(40)}`
    writeFileSync(filePath, Array.from({ length: 100 }, () => line).join('\n'))

    const script = buildSandboxReadScript({ filePath, startLine: 1, limit: 100, maxLineLength: 2000 })
    const result = spawnSync(process.execPath, [], { input: script, encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThan(50 * 1024)
    const output = JSON.parse(result.stdout) as {
      content: string
      startLine: number
      endLine: number
      totalLines: number
    }
    expect(Buffer.byteLength(JSON.stringify(output.content), 'utf8') - 2).toBeLessThanOrEqual(
      SANDBOX_READ_MAX_CONTENT_BYTES
    )
    expect(output).toMatchObject({ startLine: 1, totalLines: 100 })
    expect(output.endLine).toBeGreaterThan(0)
    expect(output.endLine).toBeLessThan(output.totalLines)
  })

  test('preserves line pagination when content fits in the byte budget', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'chatbox-read-file-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'small.txt')
    writeFileSync(filePath, 'alpha\nbeta\ngamma')

    const script = buildSandboxReadScript({ filePath, startLine: 2, limit: 1, maxLineLength: 2000 })
    const result = spawnSync(process.execPath, [], { input: script, encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      content: 'beta',
      startLine: 2,
      endLine: 2,
      totalLines: 3,
    })
  })
})
