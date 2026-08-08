export const TASK_SANDBOX_DENY_READ_PATHS = ['~/.ssh', '~/.gnupg', '~/.aws', '~/.config/gh']

export const TASK_SANDBOX_DENY_WRITE_PATHS = ['.env', '.env.local', '.env.production']

export const TASK_SANDBOX_EXTRA_WRITE_PATHS = ['/tmp']

// Large, rarely-searched directories skipped during file-content search. Shared by the
// sandbox grep path (renderer toolset) and the real-filesystem path (main process) so the
// two stay in sync.
export const SEARCH_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  'vendor',
  'target',
]
