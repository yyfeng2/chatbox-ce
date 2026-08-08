import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'

/**
 * Terminate a spawned child and its descendants across platforms.
 * POSIX: signal the detached process group (negative pid). Windows: `taskkill /T`
 * since detached process-group signalling does not exist there.
 */
export function killProcessTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (process.platform === 'win32') {
    if (child.pid) {
      try {
        // taskkill failing (e.g. process already gone) surfaces as an async 'error'
        // event; swallow it so it never crashes the main process.
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {})
        return
      } catch {
        // fall through to child.kill
      }
    }
    child.kill(signal)
    return
  }
  if (child.pid) {
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
  } else {
    child.kill(signal)
  }
}
