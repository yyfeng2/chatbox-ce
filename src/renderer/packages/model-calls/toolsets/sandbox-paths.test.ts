import type { SandboxProvider } from '@shared/sandbox-provider'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { remapPhantomHomePath, remapPhantomHomePathForProvider } from './sandbox-paths'

describe('remapPhantomHomePath', () => {
  test('rewrites /home/user paths to relative', () => {
    expect(remapPhantomHomePath('/home/user/report.txt')).toBe('report.txt')
    expect(remapPhantomHomePath('/home/user/sub/dir/file.csv')).toBe('sub/dir/file.csv')
    expect(remapPhantomHomePath('/home/user')).toBe('.')
  })

  test('rewrites /home/sandbox paths to relative', () => {
    expect(remapPhantomHomePath('/home/sandbox/out.json')).toBe('out.json')
  })

  test('rewrites ~ paths to relative', () => {
    expect(remapPhantomHomePath('~')).toBe('.')
    expect(remapPhantomHomePath('~/notes.md')).toBe('notes.md')
  })

  test('leaves relative paths unchanged', () => {
    expect(remapPhantomHomePath('report.txt')).toBe('report.txt')
    expect(remapPhantomHomePath('./sub/file.txt')).toBe('./sub/file.txt')
  })

  test('leaves genuine absolute paths unchanged', () => {
    expect(remapPhantomHomePath('/tmp/scratch.txt')).toBe('/tmp/scratch.txt')
    expect(remapPhantomHomePath('/Users/alice/Documents/a.txt')).toBe('/Users/alice/Documents/a.txt')
    expect(remapPhantomHomePath('/home/alice/a.txt')).toBe('/home/alice/a.txt')
  })

  test('does not partial-match similar prefixes', () => {
    // /home/username should NOT be treated as /home/user
    expect(remapPhantomHomePath('/home/username/a.txt')).toBe('/home/username/a.txt')
  })

  test('preserves /home/user when it is the real Linux home directory', () => {
    expect(remapPhantomHomePath('/home/user', '/home/user')).toBe('/home/user')
    expect(remapPhantomHomePath('/home/user/report.txt', '/home/user/')).toBe('/home/user/report.txt')
  })

  test('uses provider status to distinguish a real /home/user from a phantom path', async () => {
    const provider = {
      getStatus: async () => ({ initialized: false, homeDirectory: '/home/user' }),
    } as unknown as SandboxProvider

    await expect(remapPhantomHomePathForProvider('/home/user/report.txt', provider)).resolves.toBe(
      '/home/user/report.txt'
    )
  })

  test('keeps the conservative remap when provider status is unavailable', async () => {
    const provider = {
      getStatus: () => Promise.reject(new Error('unavailable')),
    } as unknown as SandboxProvider

    await expect(remapPhantomHomePathForProvider('/home/user/report.txt', provider)).resolves.toBe('report.txt')
  })

  test('handles empty input', () => {
    expect(remapPhantomHomePath('')).toBe('')
  })
})

describe('remapPhantomHomePath /mnt/data (ChatGPT code-interpreter convention)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('rewrites /mnt/data paths to relative', () => {
    expect(remapPhantomHomePath('/mnt/data/plot.py')).toBe('plot.py')
    expect(remapPhantomHomePath('/mnt/data/sub/out.csv')).toBe('sub/out.csv')
    expect(remapPhantomHomePath('/mnt/data')).toBe('.')
  })

  test('does not partial-match similar prefixes', () => {
    expect(remapPhantomHomePath('/mnt/database/a.txt')).toBe('/mnt/database/a.txt')
    expect(remapPhantomHomePath('/mnt/other/a.txt')).toBe('/mnt/other/a.txt')
  })

  test('keeps /mnt/data untouched on Linux hosts where it can be a real mount', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' })
    expect(remapPhantomHomePath('/mnt/data/plot.py')).toBe('/mnt/data/plot.py')
  })

  test('remaps /mnt/data on macOS hosts', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' })
    expect(remapPhantomHomePath('/mnt/data/plot.py')).toBe('plot.py')
  })

  test('remaps /mnt/data through the provider-aware helper', async () => {
    await expect(remapPhantomHomePathForProvider('/mnt/data/report.html')).resolves.toBe('report.html')
  })
})
