import { describe, expect, it } from 'vitest'
import { getAiAutoApprovalEligibility } from './user-exec-ai-policy'

describe('getAiAutoApprovalEligibility', () => {
  it.each([
    'bash -c "echo safe"',
    'python -c "print(1)"',
    'node -e "console.log(1)"',
    'env touch /tmp/a',
    'command touch /tmp/a',
    'curl https://example.com',
    'npm run build',
    'git checkout main',
    'find . -exec rm {} ;',
    'awk "BEGIN { system(\'rm file\') }"',
    'sudo touch /tmp/a',
    'rm -rf ./dist',
    './script.sh',
    '/usr/local/bin/custom-tool',
    'echo $(whoami)',
    'touch $HOME/.ssh/authorized_keys',
    'cp *.txt /tmp',
    'cat file | tee output',
    'echo hello > output.txt',
    'cat <<EOF',
    'touch /tmp/a\nrm -rf /tmp/a',
    'touch "unterminated',
  ])('requires manual review for %s', (command) => {
    expect(getAiAutoApprovalEligibility(command).eligible).toBe(false)
  })

  it.each(['touch /tmp/a', 'mkdir /tmp/new-directory', 'cp source.txt destination.txt', 'custom-cli status'])(
    'allows AI assessment for a structurally simple command: %s',
    (command) => {
      expect(getAiAutoApprovalEligibility(command)).toEqual({ eligible: true })
    }
  )
})
