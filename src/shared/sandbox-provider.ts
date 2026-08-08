/**
 * Sandbox provider abstraction for code execution.
 * Desktop uses local sandbox, Mobile/Web use cloud sandbox.
 */

export const DEFAULT_EXEC_TIMEOUT = 120_000

export const SANDBOX_EXEC_ERROR_CODES = {
  BASH_NOT_AVAILABLE: 'BASH_NOT_AVAILABLE',
  POWERSHELL_NOT_AVAILABLE: 'POWERSHELL_NOT_AVAILABLE',
} as const

export type SandboxExecErrorCode = (typeof SANDBOX_EXEC_ERROR_CODES)[keyof typeof SANDBOX_EXEC_ERROR_CODES]
export type SandboxExecLanguage = 'node' | 'powershell' | 'bash'

export interface SandboxExecResult {
  stdout: string
  stderr: string
  exitCode: number
  errorCode?: SandboxExecErrorCode
}

export interface SandboxOperationResult {
  success: boolean
  content?: string
  error?: string
  errorCode?: SandboxExecErrorCode
}

export interface SandboxReadResult extends SandboxOperationResult {
  startLine?: number
  endLine?: number
  totalLines?: number
}

export interface SandboxSearchParams {
  pattern: string
  path: string
  regex?: boolean
  include?: string
}

export type SandboxSearchResult = SandboxOperationResult

export interface SandboxProvider {
  type: 'local' | 'cloud'

  /** Initialize sandbox for a session, creating a temp working directory */
  init(sessionId: string): Promise<{ success: boolean; error?: string }>

  /**
   * Grant the sandbox read/write access to extra real directories (the working-directory
   * feature). Must be called before init() takes effect. No-op on providers that don't
   * support real filesystem access (e.g. cloud).
   */
  setExtraWritableDirs(dirs: string[]): void

  /** Directories accepted by the local sandbox after unsafe roots were filtered. */
  getAcceptedExtraWritableDirs?(): readonly string[]

  /** Reset/destroy the sandbox */
  reset(): Promise<void>

  /** Get current sandbox status */
  getStatus(): Promise<{
    initialized: boolean
    sessionId?: string
    workingDirectory?: string | null
    homeDirectory?: string
  }>

  /**
   * Resolve the working directory for a session without initializing the sandbox.
   * Used to tell the model its working directory before the sandbox lazily initializes.
   * Returns null when unknown (e.g. cloud sandbox).
   */
  resolveWorkingDirectory(sessionId: string): Promise<string | null>

  /** Copy a file into the sandbox working directory */
  copyFileIn(content: string, targetFilename: string): Promise<{ success: boolean; error?: string }>

  /** Copy a file from the blob store into the sandbox (avoids sending content through IPC) */
  copyBlobIn(blobKey: string, targetFilename: string): Promise<{ success: boolean; error?: string }>

  /** Read a bounded line range from a file in the sandbox. */
  readFileOut(sandboxPath: string, options?: { offset?: number; limit?: number }): Promise<SandboxReadResult>

  /** List one directory in the sandbox. Recursive file discovery uses bundled ripgrep separately. */
  listFiles(sandboxPath: string): Promise<SandboxOperationResult>

  /** Export a file from sandbox to user's filesystem (triggers save dialog on desktop) */
  exportFile(
    sandboxPath: string,
    suggestedName?: string
  ): Promise<{ success: boolean; localPath?: string; error?: string }>

  /**
   * Persist a generated file to durable storage so it stays downloadable indefinitely,
   * even after the transient sandbox working directory is evicted or cleaned up.
   * Returns the persisted absolute path; callers should fall back to the original path
   * if persistence is unsupported or fails.
   */
  persistArtifact(
    sandboxPath: string,
    displayName?: string
  ): Promise<{ success: boolean; artifactPath?: string; error?: string }>

  /** Execute code in the sandbox */
  exec(params: {
    code: string
    language: SandboxExecLanguage
    timeout?: number
    toolCallId?: string
  }): Promise<SandboxExecResult>

  /** Search file contents inside the sandbox with the shared bounded search engine. */
  search(params: SandboxSearchParams): Promise<SandboxSearchResult>

  /** Check if the sandbox is available on this platform */
  checkAvailability(): Promise<{ available: boolean; reason?: string }>
}
