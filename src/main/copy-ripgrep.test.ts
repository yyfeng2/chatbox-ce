import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

interface PackContext {
  arch: number
  electronPlatformName: string
  appOutDir: string
  packager: { getResourcesDir: (appOutDir: string) => string }
}

interface CopyRipgrepModule {
  default: (context: PackContext, options?: { projectDir?: string }) => Promise<void>
  getRipgrepSourcePath: (context: PackContext, projectDir: string) => string
  getRipgrepTargetPath: (context: PackContext) => string
}

const require = createRequire(import.meta.url)
const copyRipgrep = require('../../.erb/scripts/copy-ripgrep.cjs') as CopyRipgrepModule
const temporaryDirectories: string[] = []

function createContext(platform: string, arch: number, root: string): PackContext {
  const appOutDir = path.join(root, 'app-out')
  return {
    arch,
    electronPlatformName: platform,
    appOutDir,
    packager: { getResourcesDir: (output) => path.join(output, 'resources') },
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('copy-ripgrep afterPack helper', () => {
  test('selects the target OS and architecture binary', () => {
    const root = '/project'
    expect(copyRipgrep.getRipgrepSourcePath(createContext('darwin', 3, '/tmp/app'), root)).toBe(
      '/project/node_modules/@vscode/ripgrep-universal/bin/darwin-arm64/rg'
    )
    expect(copyRipgrep.getRipgrepSourcePath(createContext('win32', 1, '/tmp/app'), root)).toBe(
      '/project/node_modules/@vscode/ripgrep-universal/bin/win32-x64/rg.exe'
    )
  })

  test('copies only the selected binary into the packaged resources directory', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chatbox-ripgrep-pack-'))
    temporaryDirectories.push(root)
    const context = createContext('linux', 3, root)
    const source = copyRipgrep.getRipgrepSourcePath(context, root)
    mkdirSync(path.dirname(source), { recursive: true })
    writeFileSync(source, new Uint8Array(1024 * 1024).fill(7))
    writeFileSync(path.join(root, 'node_modules', '@vscode', 'ripgrep-universal', 'LICENSE'), 'MIT')
    chmodSync(source, 0o755)

    await copyRipgrep.default(context, { projectDir: root })

    const target = copyRipgrep.getRipgrepTargetPath(context)
    expect(statSync(target).size).toBe(1024 * 1024)
    expect(readFileSync(target).subarray(0, 4)).toEqual(Buffer.alloc(4, 7))
    expect(statSync(target).mode & 0o111).not.toBe(0)
    expect(readFileSync(path.join(path.dirname(target), 'LICENSE.vscode-ripgrep'), 'utf8')).toBe('MIT')
  })
})
