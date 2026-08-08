export const BackupStorageKey = {
  Settings: 'settings',
  MyCopilots: 'myCopilots',
  ConfigVersion: 'configVersion',
  ChatSessionsList: 'chat-sessions-list',
  ChatSessionSettings: 'chat-session-settings',
  PictureSessionSettings: 'picture-session-settings',
} as const

export function backupSessionStorageKey(sessionId: string): string {
  return `session:${sessionId}`
}
