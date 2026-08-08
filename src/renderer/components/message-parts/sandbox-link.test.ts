import { describe, expect, test } from 'vitest'
import { parseSandboxLinkHref } from './sandbox-link'

describe('parseSandboxLinkHref', () => {
  test('parses the canonical ChatGPT sandbox link form', () => {
    const target = parseSandboxLinkHref('sandbox:/mnt/data/plot_f_vs_idtf1_idtf2.py')
    expect(target).toEqual({
      rawPath: '/mnt/data/plot_f_vs_idtf1_idtf2.py',
      fileName: 'plot_f_vs_idtf1_idtf2.py',
      sandboxPathCandidates: ['plot_f_vs_idtf1_idtf2.py'],
    })
  })

  test('parses sloppy sandbox scheme variants', () => {
    expect(parseSandboxLinkHref('sandbox://mnt/data/out.csv')?.sandboxPathCandidates).toEqual(['out.csv'])
    expect(parseSandboxLinkHref('sandbox:///mnt/data/out.csv')?.sandboxPathCandidates).toEqual(['out.csv'])
    expect(parseSandboxLinkHref('sandbox:report.html')?.sandboxPathCandidates).toEqual(['report.html'])
    expect(parseSandboxLinkHref('SANDBOX:/mnt/data/out.csv')?.fileName).toBe('out.csv')
  })

  test('keeps non-phantom sandbox paths as-is with a basename fallback', () => {
    const target = parseSandboxLinkHref('sandbox:/tmp/exports/data.xlsx')
    expect(target?.rawPath).toBe('/tmp/exports/data.xlsx')
    expect(target?.sandboxPathCandidates).toEqual(['/tmp/exports/data.xlsx', 'data.xlsx'])
  })

  test('parses bare phantom sandbox paths without a scheme', () => {
    expect(parseSandboxLinkHref('/mnt/data/cleaned.csv')?.sandboxPathCandidates).toEqual(['cleaned.csv'])
    expect(parseSandboxLinkHref('/home/user/out.json')?.sandboxPathCandidates).toEqual(['out.json'])
    expect(parseSandboxLinkHref('/home/sandbox/out.json')?.fileName).toBe('out.json')
  })

  test('keeps subdirectories in the primary candidate', () => {
    const target = parseSandboxLinkHref('sandbox:/mnt/data/reports/q3/summary.pdf')
    expect(target?.sandboxPathCandidates).toEqual(['reports/q3/summary.pdf', 'summary.pdf'])
  })

  test('decodes URL-encoded segments and strips query/hash', () => {
    const target = parseSandboxLinkHref('sandbox:/mnt/data/my%20report.pdf?download=1#top')
    expect(target?.fileName).toBe('my report.pdf')
    expect(target?.sandboxPathCandidates).toEqual(['my report.pdf'])
  })

  test('ignores ordinary links', () => {
    expect(parseSandboxLinkHref('https://example.com/mnt/data/x.py')).toBeNull()
    expect(parseSandboxLinkHref('http://example.com')).toBeNull()
    expect(parseSandboxLinkHref('mailto:a@b.com')).toBeNull()
    expect(parseSandboxLinkHref('#section')).toBeNull()
    expect(parseSandboxLinkHref('/docs/getting-started')).toBeNull()
    expect(parseSandboxLinkHref('relative/path.md')).toBeNull()
    expect(parseSandboxLinkHref('')).toBeNull()
    expect(parseSandboxLinkHref(undefined)).toBeNull()
  })

  test('ignores degenerate sandbox hrefs without a filename', () => {
    expect(parseSandboxLinkHref('sandbox:')).toBeNull()
    expect(parseSandboxLinkHref('sandbox:/')).toBeNull()
  })
})
