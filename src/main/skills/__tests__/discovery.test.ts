import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverAgentSkills, discoverClaudeSkills, discoverSkills } from '../discovery'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    realpathSync: vi.fn(),
  },
}))

vi.mock('../parser', () => ({
  parseSkillFile: vi.fn(),
}))

vi.mock('../../util', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

import type { Dirent } from 'fs'
import fs from 'fs'
import { parseSkillFile } from '../parser'

const mockedExistsSync = vi.mocked(fs.existsSync)
const mockedMkdirSync = vi.mocked(fs.mkdirSync)
const mockedReaddirSync = vi.mocked(fs.readdirSync)
const mockedParseSkillFile = vi.mocked(parseSkillFile)
const mockedStatSync = vi.mocked(fs.statSync)
const mockedRealpathSync = vi.mocked(fs.realpathSync)

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '/skills',
  } as Dirent
}

describe('discoverSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty list when directory is empty', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([])

    const result = discoverSkills('/skills')

    expect(result).toHaveLength(0)
  })

  it('should discover valid skills from directory', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('my-skill', true)] as Dirent[])
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'my-skill', description: 'Custom skill' },
      body: 'Custom body content',
    })

    const result = discoverSkills('/skills')

    expect(result).toHaveLength(1)
    const custom = result.find((s) => s.name === 'my-skill')
    expect(custom).toBeDefined()
    expect(custom!.isBuiltin).toBe(false)
    expect(custom!.path).toBe('/skills/my-skill')
  })

  it('should skip non-directory entries', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('readme.md', false)] as Dirent[])

    const result = discoverSkills('/skills')

    expect(result).toHaveLength(0)
  })

  it('should skip directories without SKILL.md', () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === '/skills') return true
      return false
    })
    mockedReaddirSync.mockReturnValue([makeDirent('no-skill-md', true)] as Dirent[])

    const result = discoverSkills('/skills')

    expect(result).toHaveLength(0)
  })

  it('should handle duplicate skill names by keeping first occurrence', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('dup-skill', true), makeDirent('dup-skill-2', true)] as Dirent[])
    mockedParseSkillFile
      .mockReturnValueOnce({
        metadata: { name: 'dup-skill', description: 'First' },
        body: 'First body',
      })
      .mockReturnValueOnce({
        metadata: { name: 'dup-skill', description: 'Second' },
        body: 'Second body',
      })

    const result = discoverSkills('/skills')

    const customSkills = result.filter((s) => !s.isBuiltin)
    expect(customSkills).toHaveLength(1)
    expect(customSkills[0].description).toBe('First')
  })

  it('should create directory if not exists', () => {
    mockedExistsSync.mockReturnValue(false)
    mockedReaddirSync.mockReturnValue([])

    discoverSkills('/new-skills-dir')

    expect(mockedMkdirSync).toHaveBeenCalledWith('/new-skills-dir', { recursive: true })
  })

  it('should skip skills where parser returns null', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('bad-skill', true)] as Dirent[])
    mockedParseSkillFile.mockReturnValue(null)

    const result = discoverSkills('/skills')

    const customSkills = result.filter((s) => !s.isBuiltin)
    expect(customSkills).toHaveLength(0)
  })
})

describe('discoverClaudeSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array when directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false)

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toEqual([])
    expect(mockedReaddirSync).not.toHaveBeenCalled()
  })

  it('should discover a skill with valid SKILL.md', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('my-skill', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/claude/skills/my-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'My Skill', description: 'A Claude skill' },
      body: 'Skill body content here',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-skill')
    expect(result[0].path).toBe('/claude/skills/my-skill')
    expect(result[0].isBuiltin).toBe(false)
    expect(result[0].source).toEqual({ type: 'claude-code', skillPath: '/claude/skills/my-skill' })
  })

  it('should follow symlinks via statSync', () => {
    // entry.isDirectory() would return false for symlinks, but statSync follows them
    const symlinkDirent = makeDirent('linked-skill', false) // isDirectory returns false
    Object.assign(symlinkDirent, { isSymbolicLink: () => true })

    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([symlinkDirent] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/real/path/linked-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'Linked Skill', description: 'A symlinked skill' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('linked-skill')
    expect(mockedStatSync).toHaveBeenCalledWith('/claude/skills/linked-skill')
  })

  it('should deduplicate by realpath (two entries resolving to same path)', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('skill-a', true), makeDirent('skill-b', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    // Both resolve to the same realpath
    mockedRealpathSync.mockReturnValue('/real/path/same-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'Same Skill', description: 'Duplicate' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    // Only one should be returned despite two directory entries
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('skill-a')
  })

  it('should skip broken symlinks (statSync throws)', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('broken-link', true), makeDirent('good-skill', true)] as Dirent[])
    mockedStatSync
      .mockImplementationOnce(() => {
        throw new Error('ENOENT: broken symlink')
      })
      .mockReturnValueOnce({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/claude/skills/good-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'Good Skill', description: 'Works' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('good-skill')
  })

  it('should normalize names (frontmatter "Agent Browser" in dir "agent-browser")', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('agent-browser', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/claude/skills/agent-browser')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'Agent Browser', description: 'Browser automation' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('agent-browser')
  })

  it('should skip skills whose normalized name is in excludeNames', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('web-search', true), makeDirent('code-runner', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockImplementation((p) => p as string)
    mockedParseSkillFile
      .mockReturnValueOnce({
        metadata: { name: 'Web Search', description: 'Search the web' },
        body: 'body',
      })
      .mockReturnValueOnce({
        metadata: { name: 'Code Runner', description: 'Run code' },
        body: 'body',
      })

    const excludeNames = new Set(['web-search'])
    const result = discoverClaudeSkills('/claude/skills', excludeNames)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('code-runner')
  })

  it('should set source.type to claude-code', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('my-skill', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/real/path/my-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'My Skill', description: 'desc' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].source).toEqual({
      type: 'claude-code',
      skillPath: '/real/path/my-skill',
    })
  })

  it('should skip entries where parser returns null', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('unparseable', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/claude/skills/unparseable')
    mockedParseSkillFile.mockReturnValue(null)

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toEqual([])
  })

  it('should skip non-directory entries (statSync reports file)', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('readme.md', false)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => false } as fs.Stats)

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toEqual([])
  })

  it('should skip skills with un-normalizable names', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('!!!!', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/claude/skills/!!!!')
    mockedExistsSync.mockReturnValue(true)
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: '!!!!', description: 'Bad name' },
      body: 'body',
    })

    const result = discoverClaudeSkills('/claude/skills', new Set())

    expect(result).toEqual([])
  })
})

describe('discoverAgentSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should tag discovered skills with source.type "agents"', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('my-skill', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/agents/skills/my-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'My Skill', description: 'desc' },
      body: 'body',
    })

    const result = discoverAgentSkills('/agents/skills', new Set())

    expect(result).toHaveLength(1)
    expect(result[0].source).toEqual({
      type: 'agents',
      skillPath: '/agents/skills/my-skill',
    })
  })

  it('should exclude names already claimed by earlier sources', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([makeDirent('my-skill', true)] as Dirent[])
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats)
    mockedRealpathSync.mockReturnValue('/agents/skills/my-skill')
    mockedParseSkillFile.mockReturnValue({
      metadata: { name: 'my-skill', description: 'desc' },
      body: 'body',
    })

    const result = discoverAgentSkills('/agents/skills', new Set(['my-skill']))

    expect(result).toEqual([])
  })
})
