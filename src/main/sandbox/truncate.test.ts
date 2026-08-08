import { describe, expect, test } from 'vitest'
import { headTruncate, tailTruncate } from './truncate'

describe('headTruncate', () => {
  test('empty string returns empty string', () => {
    expect(headTruncate('')).toBe('')
  })

  test('falsy input returns falsy', () => {
    expect(headTruncate(undefined as unknown as string)).toBeFalsy()
  })

  test('text under both limits returns unchanged', () => {
    const text = 'line1\nline2\nline3'
    expect(headTruncate(text)).toBe(text)
  })

  test('text over maxLines truncates with notice', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const text = lines.join('\n')
    const result = headTruncate(text, 5)
    expect(result).toContain('line1')
    expect(result).toContain('line5')
    expect(result).not.toContain('line6')
    expect(result).toContain('[Output truncated. Showing first 5 of 10 lines.]')
  })

  test('text over maxBytes truncates even if line count is under limit', () => {
    const longLine = 'a'.repeat(100)
    const lines = Array.from({ length: 10 }, () => longLine)
    const text = lines.join('\n')
    // 10 lines, each 100 bytes + newlines = ~1109 bytes; set maxBytes to 500
    const result = headTruncate(text, 2000, 500)
    expect(result.length).toBeLessThan(text.length)
    expect(result).toContain('[Output truncated.')
  })

  test('unicode multi-byte characters handled correctly', () => {
    // Chinese characters are 3 bytes each in UTF-8
    const chineseLine = '中'.repeat(50) // 150 bytes per line
    const lines = Array.from({ length: 10 }, () => chineseLine)
    const text = lines.join('\n')
    // Total ~1509 bytes; set maxBytes to 500
    const result = headTruncate(text, 2000, 500)
    expect(result).toContain('[Output truncated.')
  })
})

describe('tailTruncate', () => {
  test('empty string returns empty string', () => {
    expect(tailTruncate('')).toBe('')
  })

  test('falsy input returns falsy', () => {
    expect(tailTruncate(undefined as unknown as string)).toBeFalsy()
  })

  test('text under both limits returns unchanged', () => {
    const text = 'line1\nline2\nline3'
    expect(tailTruncate(text)).toBe(text)
  })

  test('text over maxLines truncates with notice', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const text = lines.join('\n')
    const result = tailTruncate(text, 5)
    expect(result).not.toContain('line5\n')
    expect(result).toContain('line10')
    expect(result).toContain('[Output truncated. Showing last 5 of 10 lines.]')
  })

  test('text over maxBytes truncates even if line count is under limit', () => {
    const longLine = 'a'.repeat(100)
    const lines = Array.from({ length: 10 }, () => longLine)
    const text = lines.join('\n')
    const result = tailTruncate(text, 2000, 500)
    expect(result.length).toBeLessThan(text.length)
    expect(result).toContain('[Output truncated.')
  })

  test('unicode multi-byte characters handled correctly', () => {
    const chineseLine = '中'.repeat(50) // 150 bytes per line
    const lines = Array.from({ length: 10 }, () => chineseLine)
    const text = lines.join('\n')
    const result = tailTruncate(text, 2000, 500)
    expect(result).toContain('[Output truncated.')
  })
})
