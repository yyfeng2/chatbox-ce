import type {
  SandboxExecLanguage,
  SandboxExecResult,
  SandboxOperationResult,
  SandboxProvider,
  SandboxReadResult,
  SandboxSearchParams,
  SandboxSearchResult,
} from '@shared/sandbox-provider'

/**
 * Cloud sandbox provider for Mobile/Web platforms.
 * Routes through chatbox-backend API. Requires Pro license.
 *
 * TODO: Implement in Phase 6 when backend API is ready.
 */
export class CloudSandboxProvider implements SandboxProvider {
  type = 'cloud' as const

  async init(_sessionId: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  async reset(): Promise<void> {
    // no-op for now
  }

  async getStatus(): Promise<{ initialized: boolean; sessionId?: string }> {
    return { initialized: false }
  }

  async resolveWorkingDirectory(_sessionId: string): Promise<string | null> {
    return null
  }

  setExtraWritableDirs(_dirs: string[]): void {
    // Cloud sandbox has no access to the user's real filesystem.
  }

  async copyFileIn(_content: string, _targetFilename: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  async copyBlobIn(_blobKey: string, _targetFilename: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  readFileOut(_sandboxPath: string, _options?: { offset?: number; limit?: number }): Promise<SandboxReadResult> {
    return Promise.resolve({ success: false, error: 'Cloud sandbox not yet implemented' })
  }

  listFiles(_sandboxPath: string): Promise<SandboxOperationResult> {
    return Promise.resolve({ success: false, error: 'Cloud sandbox not yet implemented' })
  }

  async exportFile(
    _sandboxPath: string,
    _suggestedName?: string
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  async persistArtifact(
    _sandboxPath: string,
    _displayName?: string
  ): Promise<{ success: boolean; artifactPath?: string; error?: string }> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  async exec(_params: {
    code: string
    language: SandboxExecLanguage
    timeout?: number
    toolCallId?: string
  }): Promise<SandboxExecResult> {
    return { stdout: '', stderr: 'Cloud sandbox not yet implemented', exitCode: 1 }
  }

  async search(_params: SandboxSearchParams): Promise<SandboxSearchResult> {
    return { success: false, error: 'Cloud sandbox not yet implemented' }
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return { available: false, reason: 'Cloud sandbox not yet implemented' }
  }
}
