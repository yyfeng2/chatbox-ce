import { app } from 'electron'
import { registerSandboxIPCHandlers } from './ipc-handlers'
import { cleanupStaleSandboxDirs, resetAllSessions } from './manager'
import { stopSandboxHtmlPreviewServer } from './preview-server'

export function registerSandboxHandlers() {
  registerSandboxIPCHandlers()
  // Clean up stale sandbox temp directories (older than 7 days) on app startup
  cleanupStaleSandboxDirs()
  // Kill running sandbox processes and clean up sessions on app quit
  app.on('before-quit', () => {
    stopSandboxHtmlPreviewServer()
    void resetAllSessions()
  })
}
