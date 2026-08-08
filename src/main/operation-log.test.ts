import { describe, expect, it } from 'vitest'
import {
  buildOperationFinishLog,
  buildOperationStartLog,
  operationTextPreview,
  redactOperationText,
} from './operation-log'

describe('operation log', () => {
  it('redacts common secret shapes', () => {
    const redacted = redactOperationText(
      'curl -H "Authorization: Bearer abc.def" --token secret123 api_key=sk-1234567890abcdef password=hunter2 AWS_SECRET_ACCESS_KEY=aws-secret GH_TOKEN=github-secret'
    )

    expect(redacted).toContain('Authorization: [REDACTED]')
    expect(redacted).toContain('--token [REDACTED]')
    expect(redacted).toContain('api_key=[REDACTED]')
    expect(redacted).toContain('password=[REDACTED]')
    expect(redacted).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED]')
    expect(redacted).toContain('GH_TOKEN=[REDACTED]')
    expect(redacted).not.toContain('abc.def')
    expect(redacted).not.toContain('secret123')
    expect(redacted).not.toContain('hunter2')
    expect(redacted).not.toContain('aws-secret')
    expect(redacted).not.toContain('github-secret')
  })

  it('keeps command previews bounded', () => {
    const preview = operationTextPreview(`prefix ${'x'.repeat(2000)} suffix`, 120)

    expect(preview.length).toBeLessThanOrEqual(160)
    expect(preview).toContain('[truncated')
    expect(preview).toContain('prefix')
    expect(preview).toContain('suffix')
  })

  it('omits output previews for successful operations', () => {
    const log = buildOperationFinishLog({
      operationId: 'op-1',
      success: true,
      exitCode: 0,
      durationMs: 12,
      stdout: 'large output',
      stderr: '',
    })

    expect(log).toContain('"stdoutBytes":12')
    expect(log).not.toContain('stdoutPreview')
  })

  it('uses raw output byte counts when the preview text was truncated', () => {
    const log = buildOperationFinishLog({
      operationId: 'op-1',
      success: false,
      exitCode: 1,
      durationMs: 12,
      stdout: 'truncated output',
      stderr: '',
      stdoutBytes: 2_000_000,
      stderrBytes: 300,
    })

    expect(log).toContain('"stdoutBytes":2000000')
    expect(log).toContain('"stderrBytes":300')
  })

  it('includes bounded output previews for failed operations', () => {
    const log = buildOperationFinishLog({
      operationId: 'op-1',
      success: false,
      exitCode: 1,
      durationMs: 12,
      stdout: '',
      stderr: `error ${'x'.repeat(3000)} token=secret`,
    })

    expect(log.length).toBeLessThan(2500)
    expect(log).toContain('stderrPreview')
    expect(log).toContain('token=[REDACTED]')
    expect(log).not.toContain('token=secret')
  })

  it('records a command hash instead of relying only on the preview', () => {
    const log = buildOperationStartLog({
      operationId: 'op-1',
      kind: 'user_exec',
      command: 'echo hello',
    })

    expect(log).toContain('"commandHash"')
    expect(log).toContain('"commandPreview":"echo hello"')
  })

  it('records how a user command was approved', () => {
    const log = buildOperationStartLog({
      operationId: 'op-1',
      kind: 'user_exec',
      command: 'pwd',
      approvalSource: 'ai',
    })

    expect(log).toContain('"approvalSource":"ai"')
  })
})
