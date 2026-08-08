import type { SandboxProvider } from '@shared/sandbox-provider'

// Models trained on cloud sandboxes (E2B and similar) frequently emit "phantom home"
// absolute paths such as /home/user/report.txt or ~/report.txt. On the desktop host these
// paths do not exist and would otherwise route to the real filesystem (failing or prompting
// for approval). Rewriting them to a relative path makes the operation resolve inside the
// sandbox working directory instead, matching the model's intent.
//
// The list is intentionally conservative: only paths that are effectively never real user
// paths on a desktop host. The working directory's HOME is also pointed here at exec time,
// so `~`/`$HOME` inside code_execution already resolve correctly; this shim covers the
// structured filesystem tools where the model passes the literal path string.
const PHANTOM_HOME_PREFIXES = ['/home/user', '/home/sandbox']

// ChatGPT's code interpreter exposes uploads and outputs under /mnt/data, so models trained
// on it habitually address sandbox files as /mnt/data/<name>. Remap those into the working
// directory too — except on Linux hosts, where /mnt/data can be a real mount point the user
// actually means (macOS and Windows have no native /mnt/data).
const PHANTOM_SANDBOX_DATA_PREFIXES = ['/mnt/data']

// Read at call time so tests can stub navigator. Kept dependency-free on purpose (this
// module is imported by tool hot paths).
function isLinuxHost(): boolean {
  return typeof navigator !== 'undefined' && (navigator.userAgent ?? '').includes('Linux')
}

/**
 * Rewrite a phantom-home absolute path to a path relative to the sandbox working directory.
 * Returns the input unchanged when it is not a recognized phantom-home path.
 */
export function remapPhantomHomePath(filePath: string, realHomeDirectory?: string): string {
  if (!filePath) return filePath

  // ~ and ~/x → relative to the working directory.
  if (filePath === '~') return '.'
  if (filePath.startsWith('~/')) return filePath.slice(2) || '.'

  for (const prefix of PHANTOM_HOME_PREFIXES) {
    // `/home/user` is a common model hallucination, but it can also be the actual home
    // directory on Linux. Preserve it in that one case so explicit real-filesystem access
    // is not silently redirected into the sandbox.
    if (prefix === '/home/user' && realHomeDirectory?.replace(/\/+$/, '') === prefix) continue
    if (filePath === prefix) return '.'
    if (filePath.startsWith(`${prefix}/`)) {
      return filePath.slice(prefix.length + 1) || '.'
    }
  }

  if (!isLinuxHost()) {
    for (const prefix of PHANTOM_SANDBOX_DATA_PREFIXES) {
      if (filePath === prefix) return '.'
      if (filePath.startsWith(`${prefix}/`)) {
        return filePath.slice(prefix.length + 1) || '.'
      }
    }
  }

  return filePath
}

/** Resolve phantom-home paths using host information when the local provider exposes it. */
export async function remapPhantomHomePathForProvider(filePath: string, provider?: SandboxProvider): Promise<string> {
  // Avoid a status/IPC lookup for every ordinary tool path. Cloud providers do not expose
  // a host home, so a missing status value deliberately retains the conservative remap.
  if (filePath !== '/home/user' && !filePath.startsWith('/home/user/')) {
    return remapPhantomHomePath(filePath)
  }
  if (!provider) return remapPhantomHomePath(filePath)
  const status = await provider.getStatus().catch(() => null)
  return remapPhantomHomePath(filePath, status?.homeDirectory)
}
