import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { runRipgrepFileList, runRipgrepSearch } from './ripgrep-search'

const temporaryDirectories: string[] = []
const bundledRipgrepPath = path.join(
  process.cwd(),
  'node_modules',
  '@vscode',
  'ripgrep-universal',
  'bin',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'rg.exe' : 'rg'
)
const ripgrepPath = existsSync(bundledRipgrepPath)
  ? bundledRipgrepPath
  : execFileSync(process.platform === 'win32' ? 'where' : 'which', ['rg'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)[0]

function createFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'chatbox-ripgrep-search-'))
  temporaryDirectories.push(root)
  mkdirSync(path.join(root, 'nested'), { recursive: true })
  mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  writeFileSync(path.join(root, 'nested', 'example.ts'), 'alpha 123\nfoo(bar)\n')
  writeFileSync(path.join(root, 'notes.md'), 'alpha 456\n')
  writeFileSync(path.join(root, 'nested', 'empty.txt'), '')
  writeFileSync(path.join(root, 'node_modules', 'ignored.ts'), 'alpha 789\n')
  return root
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('runRipgrepSearch', () => {
  test('uses one Rust-regex dialect and applies include/exclude filters', async () => {
    const root = createFixture()
    const result = await runRipgrepSearch(
      { root, pattern: String.raw`\d+?`, regex: true, include: '*.ts' },
      { ripgrepPath }
    )

    expect(result).toEqual({ success: true, content: 'nested/example.ts:1:alpha 123' })
  })

  test('literal mode does not interpret regex metacharacters', async () => {
    const root = createFixture()
    const result = await runRipgrepSearch({ root, pattern: 'foo(bar)' }, { ripgrepPath })

    expect(result).toEqual({ success: true, content: 'nested/example.ts:2:foo(bar)' })
  })

  test('rejects unsupported backreferences instead of falling back to PCRE2', async () => {
    const root = createFixture()
    const result = await runRipgrepSearch({ root, pattern: String.raw`(alpha)\1`, regex: true }, { ripgrepPath })

    expect(result.success).toBe(false)
    expect(result.error).toContain('backreferences are not supported')
  })

  test('handles nested quantifiers without catastrophic backtracking', async () => {
    const root = createFixture()
    writeFileSync(path.join(root, 'long.txt'), `${'a'.repeat(200_000)}X\n`)

    const result = await runRipgrepSearch({ root, pattern: '^(a+)+$', regex: true }, { ripgrepPath, timeoutMs: 2000 })

    expect(result).toEqual({ success: true, content: '' })
  })

  test('enforces the wall-clock timeout outside the search process', async () => {
    const root = createFixture()
    const startedAt = Date.now()

    const result = await runRipgrepSearch(
      { root, pattern: 'x' },
      {
        ripgrepPath,
        timeoutMs: 50,
        prepareCommand: async () => ({
          command: process.execPath,
          args: ['-e', 'setInterval(() => {}, 1000)'],
        }),
      }
    )

    expect(result).toEqual({ success: true, content: '... [search stopped after time limit]' })
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  test('caps matches per file and across the complete search', async () => {
    const root = createFixture()
    for (let index = 0; index < 3; index++) {
      writeFileSync(path.join(root, `matches-${index}.txt`), Array.from({ length: 60 }, () => 'needle').join('\n'))
    }

    const result = await runRipgrepSearch({ root, pattern: 'needle' }, { ripgrepPath })
    const lines = result.content?.split('\n') ?? []
    const counts = new Map<string, number>()
    for (const line of lines) {
      const file = line.split(':', 1)[0]
      counts.set(file, (counts.get(file) ?? 0) + 1)
    }

    expect(result.success).toBe(true)
    expect(lines).toHaveLength(100)
    expect(Math.max(...counts.values())).toBe(50)
  })
})

describe('runRipgrepFileList', () => {
  test('uses ripgrep file enumeration, includes empty files, and applies glob/exclude rules', async () => {
    const root = createFixture()
    const result = await runRipgrepFileList({ root, pattern: '*.txt' }, { ripgrepPath })

    expect(result).toEqual({ success: true, content: 'nested/empty.txt' })
  })

  test('preserves the searched directory prefix in returned paths', async () => {
    const root = createFixture()
    const result = await runRipgrepFileList({ root, path: 'nested', pattern: '*.txt' }, { ripgrepPath })

    expect(result).toEqual({ success: true, content: 'nested/empty.txt' })
  })
})
