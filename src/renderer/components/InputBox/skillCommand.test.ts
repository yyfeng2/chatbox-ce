import { describe, expect, it } from 'vitest'
import { getTrailingSkillCommand, insertSkillCommandText } from './skillCommand'

describe('getTrailingSkillCommand', () => {
  it('detects a slash command at the end of input', () => {
    expect(getTrailingSkillCommand('/')).toEqual({ query: '', start: 0 })
    expect(getTrailingSkillCommand('hello /fi')).toEqual({ query: 'fi', start: 6 })
  })

  it('ignores slash commands that are no longer the active trailing token', () => {
    expect(getTrailingSkillCommand('hello /foo bar')).toBeNull()
    expect(getTrailingSkillCommand('https://example.com/')).toBeNull()
  })
})

describe('insertSkillCommandText', () => {
  it('inserts a skill command into empty or plain text input', () => {
    expect(insertSkillCommandText('', 'analysis')).toBe('/analysis ')
    expect(insertSkillCommandText('hello', 'analysis')).toBe('hello /analysis ')
  })

  it('replaces only the active trailing slash token', () => {
    expect(insertSkillCommandText('/fi', 'find-skills')).toBe('/find-skills ')
    expect(insertSkillCommandText('/analysis /fi', 'find-skills')).toBe('/analysis /find-skills ')
  })
})
