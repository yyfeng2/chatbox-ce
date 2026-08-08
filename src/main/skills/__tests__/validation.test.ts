import { describe, expect, it } from 'vitest'
import { isValidSkillName, normalizeClaudeSkillName } from '../validation'

describe('isValidSkillName', () => {
  it('accepts valid kebab-case names', () => {
    expect(isValidSkillName('my-skill')).toBe(true)
    expect(isValidSkillName('a')).toBe(true)
    expect(isValidSkillName('agent-browser')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidSkillName('')).toBe(false)
  })

  it('rejects names with uppercase', () => {
    expect(isValidSkillName('My-Skill')).toBe(false)
  })

  it('rejects names longer than 64 chars', () => {
    expect(isValidSkillName('a'.repeat(65))).toBe(false)
  })

  it('accepts names exactly 64 chars', () => {
    expect(isValidSkillName('a'.repeat(64))).toBe(true)
  })

  it('rejects names with spaces', () => {
    expect(isValidSkillName('my skill')).toBe(false)
  })
})

describe('normalizeClaudeSkillName', () => {
  it('returns directory name when it is already valid kebab-case', () => {
    expect(normalizeClaudeSkillName('Agent Browser', 'agent-browser')).toBe('agent-browser')
  })

  it('normalizes uppercase + spaces from dirName', () => {
    expect(normalizeClaudeSkillName('My Cool Skill', 'my-cool-skill')).toBe('my-cool-skill')
  })

  it('falls back to rawName when dirName is invalid (only special chars)', () => {
    expect(normalizeClaudeSkillName('valid-name', '!!!!')).toBe('valid-name')
  })

  it('truncates to 64 chars', () => {
    const longName = 'a'.repeat(100)
    const result = normalizeClaudeSkillName(longName, longName)
    expect(result.length).toBe(64)
  })

  it('returns empty string when both inputs are invalid', () => {
    expect(normalizeClaudeSkillName('!!!!', '!!!!')).toBe('')
  })

  it('collapses multiple hyphens', () => {
    expect(normalizeClaudeSkillName('a--b', 'a--b')).toBe('a-b')
  })

  it('strips leading and trailing hyphens', () => {
    expect(normalizeClaudeSkillName('-leading-', '-trailing-')).toBe('trailing')
    // dirName "-trailing-" normalizes to "trailing", which is valid
  })

  it('prefers dirName over rawName when both are normalizable', () => {
    expect(normalizeClaudeSkillName('Raw Name', 'dir-name')).toBe('dir-name')
  })

  it('normalizes spaces to hyphens', () => {
    expect(normalizeClaudeSkillName('my cool skill', '!!!')).toBe('my-cool-skill')
  })

  it('handles mixed special characters', () => {
    expect(normalizeClaudeSkillName('hello@world#2024', '!!!')).toBe('hello-world-2024')
  })
})
