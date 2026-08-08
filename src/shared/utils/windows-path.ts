function normalizeSegments(value: string | undefined): string[] {
  const segments: string[] = []
  for (const segment of (value ?? '').split(/[\\/]+/)) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments
}

/**
 * Normalize native and shell-style absolute Windows paths to native drive/UNC form.
 *
 * Supported shell aliases cover the formats commonly produced by WSL, Git Bash and
 * Cygwin: `/mnt/c/...`, `/c/...` and `/cygdrive/c/...`.
 */
export function normalizeWindowsAbsolutePath(input: string): string | null {
  const uncMatch = input.match(/^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(?:[\\/](.*))?$/)
  if (uncMatch) {
    const root = `\\\\${uncMatch[1]}\\${uncMatch[2]}`
    const segments = normalizeSegments(uncMatch[3])
    return segments.length > 0 ? `${root}\\${segments.join('\\')}` : `${root}\\`
  }

  const driveMatch = input.match(/^([a-zA-Z]):[\\/](.*)$/)
  if (driveMatch) {
    const root = `${driveMatch[1].toUpperCase()}:\\`
    const segments = normalizeSegments(driveMatch[2])
    return segments.length > 0 ? `${root}${segments.join('\\')}` : root
  }

  const shellMatch = input.match(/^\/(?:mnt\/|cygdrive\/)?([a-zA-Z])(?:\/(.*))?\/?$/)
  if (shellMatch) {
    const root = `${shellMatch[1].toUpperCase()}:\\`
    const segments = normalizeSegments(shellMatch[2])
    return segments.length > 0 ? `${root}${segments.join('\\')}` : root
  }

  return null
}

export function isWindowsAbsolutePath(input: string): boolean {
  return normalizeWindowsAbsolutePath(input) !== null
}

export function isWindowsFilesystemRoot(input: string): boolean {
  const normalized = normalizeWindowsAbsolutePath(input)
  if (!normalized) return false
  if (/^[A-Z]:\\$/.test(normalized)) return true
  return /^\\\\[^\\]+\\[^\\]+\\$/.test(normalized)
}

/** Case-insensitive, segment-aware containment for normalized Windows paths. */
export function isWindowsPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeWindowsAbsolutePath(root)
  const normalizedCandidate = normalizeWindowsAbsolutePath(candidate)
  if (!normalizedRoot || !normalizedCandidate) return false

  const rootKey = normalizedRoot.replace(/\\+$/, '').toLocaleLowerCase('en-US')
  const candidateKey = normalizedCandidate.replace(/\\+$/, '').toLocaleLowerCase('en-US')
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}\\`)
}
