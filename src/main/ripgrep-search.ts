import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { app } from 'electron'
import { SEARCH_EXCLUDE_DIRS } from '../shared/task-sandbox'

const SEARCH_MAX_RESULTS = 100
const SEARCH_MAX_MATCHES_PER_FILE = 50
const SEARCH_MAX_FILE_SIZE = '5M'
const SEARCH_MAX_COLUMNS = 2000
const SEARCH_TIMEOUT_MS = 5000
const STDERR_LIMIT_BYTES = 64 * 1024

export interface RipgrepSearchParams {
  root: string
  pattern: string
  regex?: boolean
  include?: string
}

export interface RipgrepSearchResult {
  success: boolean
  content?: string
  error?: string
}

export interface RipgrepFileListParams {
  root: string
  path?: string
  pattern?: string
}

export type RipgrepFileListResult = RipgrepSearchResult

interface PreparedCommand {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  detached?: boolean
}

export interface RipgrepRunnerOptions {
  ripgrepPath?: string
  timeoutMs?: number
  prepareCommand?: (command: string, args: string[]) => Promise<PreparedCommand>
  terminate?: (child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL') => void
  onChild?: (child: ChildProcess | null) => void
}

function getPlatformBinaryName(): string {
  return process.platform === 'win32' ? 'rg.exe' : 'rg'
}

function getPlatformPackageDirectory(): string {
  return `${process.platform}-${process.arch}`
}

/** Resolve the target-specific ripgrep copied by afterPack, or the universal dev dependency. */
export function getRipgrepBinaryPath(): string {
  const binaryName = getPlatformBinaryName()
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ripgrep', binaryName)
  }

  const packageRelativePath = path.join(
    'node_modules',
    '@vscode',
    'ripgrep-universal',
    'bin',
    getPlatformPackageDirectory(),
    binaryName
  )
  const candidates = [
    path.join(process.cwd(), packageRelativePath),
    path.join(app.getAppPath(), packageRelativePath),
    path.join(__dirname, '..', '..', packageRelativePath),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function buildRipgrepArgs(params: RipgrepSearchParams): string[] {
  const args = [
    '--no-config',
    '--hidden',
    '--no-ignore',
    '--threads',
    '1',
    '--line-number',
    '--with-filename',
    '--no-heading',
    '--color',
    'never',
    '--path-separator',
    '/',
    '--max-count',
    String(SEARCH_MAX_MATCHES_PER_FILE),
    '--max-filesize',
    SEARCH_MAX_FILE_SIZE,
    '--max-columns',
    String(SEARCH_MAX_COLUMNS),
    '--max-columns-preview',
  ]

  if (!params.regex) args.push('--fixed-strings')
  if (params.include) args.push('--glob', params.include)
  for (const directory of SEARCH_EXCLUDE_DIRS) {
    args.push('--glob', `!**/${directory}/**`)
  }
  args.push('--regexp', params.pattern, '--', '.')
  return args
}

function buildRipgrepFileListArgs(params: RipgrepFileListParams): string[] {
  const args = ['--no-config', '--hidden', '--no-ignore', '--path-separator', '/', '--files']
  if (params.pattern) args.push('--glob', params.pattern)
  for (const directory of SEARCH_EXCLUDE_DIRS) {
    args.push('--glob', `!**/${directory}/**`)
  }
  args.push('--', params.path ?? '.')
  return args
}

function normalizeResultLine(line: string): string {
  return line.replace(/^\.\//, '')
}

/**
 * Search with ripgrep's default Rust regex engine. The engine is linear-time and deliberately
 * does not enable PCRE2, so model-supplied patterns cannot trigger catastrophic backtracking.
 */
export function runRipgrepSearch(
  params: RipgrepSearchParams,
  options: RipgrepRunnerOptions = {}
): Promise<RipgrepSearchResult> {
  const root = path.resolve(params.root)
  return runRipgrepLines(root, buildRipgrepArgs(params), options)
}

/** Recursively list files with bundled ripgrep instead of walking large trees in Node. */
export function runRipgrepFileList(
  params: RipgrepFileListParams,
  options: RipgrepRunnerOptions = {}
): Promise<RipgrepFileListResult> {
  return runRipgrepLines(path.resolve(params.root), buildRipgrepFileListArgs(params), options)
}

async function runRipgrepLines(
  root: string,
  baseArgs: string[],
  options: RipgrepRunnerOptions
): Promise<RipgrepSearchResult> {
  const ripgrepPath = options.ripgrepPath ?? getRipgrepBinaryPath()
  const prepared = options.prepareCommand
    ? await options.prepareCommand(ripgrepPath, baseArgs)
    : { command: ripgrepPath, args: baseArgs }
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS
  const terminate = options.terminate ?? ((child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL') => child.kill(signal))

  return await new Promise((resolve) => {
    const results: string[] = []
    let stderr = ''
    let stderrBytes = 0
    let pendingStdout = ''
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let timedOut = false
    let resultLimitReached = false
    let terminationStarted = false
    let forceKillTimer: NodeJS.Timeout | undefined
    let settled = false

    const child = spawn(prepared.command, prepared.args, {
      cwd: root,
      env: prepared.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      detached: prepared.detached ?? false,
      windowsHide: true,
    })
    options.onChild?.(child)

    const stop = () => {
      if (terminationStarted) return
      terminationStarted = true
      terminate(child, 'SIGTERM')
      forceKillTimer = setTimeout(() => terminate(child, 'SIGKILL'), 1000)
    }

    const consumeLines = (flush = false) => {
      const lines = pendingStdout.split('\n')
      pendingStdout = flush ? '' : (lines.pop() ?? '')
      const completeLines = flush ? lines.filter((line, index) => line || index < lines.length - 1) : lines
      for (const line of completeLines) {
        if (!line) continue
        results.push(normalizeResultLine(line))
        if (results.length >= SEARCH_MAX_RESULTS) {
          resultLimitReached = true
          stop()
          break
        }
      }
    }

    const finish = (result: RipgrepSearchResult) => {
      if (settled) return
      settled = true
      options.onChild?.(null)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      if (resultLimitReached) return
      pendingStdout += stdoutDecoder.write(chunk)
      consumeLines()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= STDERR_LIMIT_BYTES) return
      const remaining = STDERR_LIMIT_BYTES - stderrBytes
      const bounded = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
      stderr += stderrDecoder.write(bounded)
      stderrBytes += bounded.byteLength
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ success: false, error: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (!resultLimitReached) {
        pendingStdout += stdoutDecoder.end()
        consumeLines(true)
      }
      stderr += stderrDecoder.end()
      const contentLines = results.slice(0, SEARCH_MAX_RESULTS)
      if (timedOut) contentLines.push('... [search stopped after time limit]')

      if (timedOut || resultLimitReached || code === 0 || code === 1) {
        finish({ success: true, content: contentLines.join('\n') })
        return
      }

      const error = stderr.trim()
      finish({ success: false, error: error || `ripgrep exited with code ${code ?? 1}` })
    })
  })
}
