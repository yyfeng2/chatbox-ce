import { describe, expect, it } from 'vitest'

import { formatNumber, formatUsage } from './format'

describe('formatNumber', () => {
  it('returns plain string for numbers below 1000', () => {
    expect(formatNumber(191)).toBe('191')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(-123)).toBe('-123')
  })

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1K')
    expect(formatNumber(123456)).toBe('123K')
    expect(formatNumber(999999)).toBe('999K')
  })

  it('formats millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1M')
    expect(formatNumber(12000000)).toBe('12M')
  })

  it('formats negative numbers using current floor behavior', () => {
    expect(formatNumber(-1000)).toBe('-1K')
    expect(formatNumber(-1500)).toBe('-2K')
    expect(formatNumber(-1000000)).toBe('-1M')
    expect(formatNumber(-1500000)).toBe('-2M')
  })

  it('supports decimals parameter for K and M', () => {
    expect(formatNumber(1500, 1)).toBe('1.5K')
    expect(formatNumber(999999, 2)).toBe('1000.00K')
    expect(formatNumber(1500000, 2)).toBe('1.50M')
    expect(formatNumber(-1500, 1)).toBe('-1.5K')
  })

  it('formats Chinese compact units when requested', () => {
    expect(formatNumber(1000, 0, true)).toBe('1千')
    expect(formatNumber(12000, 1, true)).toBe('1.2万')
    expect(formatNumber(12000000, 2, true)).toBe('1.20千万')
    expect(formatNumber(120000000, 2, true)).toBe('1.20亿')
  })
})

describe('formatUsage', () => {
  it('combines formatted used/total values', () => {
    expect(formatUsage(191, 200)).toBe('191/200')
    expect(formatUsage(210000, 12000000)).toBe('210K/12M')
  })

  it('passes decimals parameter through to formatNumber', () => {
    expect(formatUsage(1500, 1000000, 1)).toBe('1.5K/1.0M')
  })

  it('passes Chinese compact unit option through to formatNumber', () => {
    expect(formatUsage(210000, 12000000, 1, true)).toBe('21.0万/1.2千万')
  })
})
