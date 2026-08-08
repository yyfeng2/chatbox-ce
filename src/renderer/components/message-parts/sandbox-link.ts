/**
 * Detection for hallucinated "download links" that point into a model sandbox.
 *
 * Models trained on hosted code-interpreter sandboxes (ChatGPT and similar) habitually
 * end file tasks with markdown like `[download](sandbox:/mnt/data/report.py)` instead of
 * calling the create_download tool. Those hrefs are not real URLs — clicking them does
 * nothing. The renderer swaps them for a file chip that tries to rescue the file from the
 * session sandbox on click (see SandboxFileLink).
 */

// Path prefixes that only ever exist inside a model sandbox, never on the user's machine
// as intended link targets. Kept aligned with the tool-input remapping in
// packages/model-calls/toolsets/sandbox-paths.ts.
const PHANTOM_SANDBOX_PATH_PREFIXES = ['/mnt/data/', '/home/user/', '/home/sandbox/']

export interface SandboxLinkTarget {
  /** The path as the model wrote it (scheme stripped), for tooltips and diagnostics. */
  rawPath: string
  /** Filename used for display, export suggestions, and basename fallback lookup. */
  fileName: string
  /** Sandbox paths to try when rescuing the file, most specific first. */
  sandboxPathCandidates: string[]
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function stripQueryAndHash(path: string): string {
  return path.replace(/[?#].*$/, '')
}

/**
 * Parse an anchor href into a sandbox link target, or null when the href is an ordinary
 * link. Recognizes `sandbox:` scheme URLs in their sloppy real-world variants
 * (`sandbox:/x`, `sandbox://x`, `sandbox:///x`, `sandbox:x`) and bare phantom sandbox
 * paths such as `/mnt/data/report.csv`.
 */
export function parseSandboxLinkHref(href: string | null | undefined): SandboxLinkTarget | null {
  if (!href) return null
  const trimmed = href.trim()

  let rawPath: string | null = null
  const schemeMatch = /^sandbox:(.*)$/i.exec(trimmed)
  if (schemeMatch) {
    const rest = stripQueryAndHash(schemeMatch[1])
    // Collapse authority-style slashes: sandbox:///mnt/data/x and sandbox://mnt/data/x
    // both mean the absolute path /mnt/data/x.
    rawPath = rest.startsWith('/') ? rest.replace(/^\/+/, '/') : rest
    if (!rawPath) return null
  } else if (PHANTOM_SANDBOX_PATH_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    rawPath = stripQueryAndHash(trimmed)
  }

  if (!rawPath) return null

  const decodedPath = rawPath.split('/').map(decodeSegment).join('/')
  const segments = decodedPath.split('/').filter(Boolean)
  const fileName = segments[segments.length - 1] ?? ''
  if (!fileName) return null

  // Sandbox link targets resolve inside the sandbox by definition, so phantom prefixes
  // are stripped unconditionally here (unlike tool-input remapping, which must preserve
  // real /mnt/data mounts on Linux hosts).
  let primary = decodedPath
  for (const prefix of PHANTOM_SANDBOX_PATH_PREFIXES) {
    if (decodedPath.startsWith(prefix)) {
      primary = decodedPath.slice(prefix.length)
      break
    }
  }

  const candidates = [primary]
  if (fileName !== primary) {
    // Basename fallback: the model may have invented directories that do not exist in
    // the working directory even though the file itself does.
    candidates.push(fileName)
  }

  return {
    rawPath,
    fileName,
    sandboxPathCandidates: candidates,
  }
}
