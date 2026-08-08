import { tokenizeShellWords } from './user-exec-command-utils'

const BLOCKED_EXECUTABLES = new Set([
  // Shells, interpreters, and arbitrary code runners
  'bash',
  'sh',
  'zsh',
  'fish',
  'dash',
  'eval',
  'source',
  'python',
  'python3',
  'node',
  'ruby',
  'perl',
  'php',
  'osascript',
  'powershell',
  'pwsh',

  // Command wrappers and package/script runners
  'command',
  'env',
  'xargs',
  'npx',
  'pnpx',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'awk',
  'gawk',
  'sed',
  'find',
  'git',
  'docker',
  'kubectl',
  'brew',
  'pip',
  'pip3',
  'cargo',
  'go',

  // Remote access, downloads, and network execution
  'curl',
  'wget',
  'ssh',
  'scp',
  'sftp',
  'nc',
  'ncat',
  'netcat',

  // Privilege, system, process, and destructive operations
  'sudo',
  'su',
  'launchctl',
  'systemctl',
  'kill',
  'killall',
  'pkill',
  'rm',
  'dd',
  'mkfs',
  'diskutil',
  'chmod',
  'chown',
  'chgrp',
  'useradd',
  'userdel',
  'usermod',
])

const UNSAFE_SHELL_SYNTAX = /[\r\n`$|;&<>*?{}]/

export interface AiAutoApprovalEligibility {
  eligible: boolean
  reason?: string
}

/**
 * Code-enforced maximum-impact boundary for AI approval.
 *
 * This intentionally does not try to prove a command safe. It only prevents
 * clearly high-impact or injection-friendly command classes from being
 * auto-approved even if the model returns an approve assessment.
 */
export function getAiAutoApprovalEligibility(command: string): AiAutoApprovalEligibility {
  const trimmed = command.trim()
  if (!trimmed) return { eligible: false, reason: 'empty_command' }

  if (UNSAFE_SHELL_SYNTAX.test(trimmed)) {
    return { eligible: false, reason: 'complex_shell_syntax' }
  }

  const tokens = tokenizeShellWords(trimmed)
  if (!tokens || tokens.length === 0) {
    return { eligible: false, reason: 'unparseable_command' }
  }

  const executableToken = tokens[0]
  if (executableToken.includes('/') || executableToken.startsWith('.')) {
    return { eligible: false, reason: 'direct_executable_path' }
  }

  const executable = executableToken.toLowerCase()
  if (BLOCKED_EXECUTABLES.has(executable)) {
    return { eligible: false, reason: 'blocked_executable' }
  }

  return { eligible: true }
}
