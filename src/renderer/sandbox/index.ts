import type { SandboxProvider } from '@shared/sandbox-provider'
import platform from '@/platform'
import { CloudSandboxProvider } from './cloud-provider'
import { LocalSandboxProvider } from './local-provider'

/**
 * Create a sandbox provider based on the current platform.
 * Returns null if no sandbox is available.
 */
export function createSandboxProvider(): SandboxProvider | null {
  if (platform.type === 'desktop') {
    return new LocalSandboxProvider()
  }
  if (platform.type === 'mobile' || platform.type === 'web') {
    return new CloudSandboxProvider()
  }
  return null
}
