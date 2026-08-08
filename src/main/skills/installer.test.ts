import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}))

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    promises: {
      cp: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../util', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('./github-fetcher', () => ({
  detectSkillsInRepo: vi.fn(),
  downloadSkillFiles: vi.fn(),
  getLatestCommitHash: vi.fn(),
  getSkillTreeSha: vi.fn(),
}))

vi.mock('./parser', () => ({
  parseSkillFile: vi.fn(),
}))

vi.mock('../sandbox/manager', () => ({
  getStatus: vi.fn(),
  validateWritePath: vi.fn(),
}))

import fs from 'fs'
import { getStatus, validateWritePath } from '../sandbox/manager'
import { detectSkillsInRepo, downloadSkillFiles, getLatestCommitHash, getSkillTreeSha } from './github-fetcher'
import {
  checkForUpdates,
  deleteSkill,
  installSkillFromGitHub,
  installSkillFromMarketplace,
  installSkillFromSandbox,
} from './installer'
import { parseSkillFile } from './parser'

const mockedFs = vi.mocked(fs)
const mockedDetect = vi.mocked(detectSkillsInRepo)
const mockedDownload = vi.mocked(downloadSkillFiles)
const mockedGetHash = vi.mocked(getLatestCommitHash)
const mockedGetTreeSha = vi.mocked(getSkillTreeSha)
const mockedParse = vi.mocked(parseSkillFile)
const mockedGetStatus = vi.mocked(getStatus)
const mockedValidateWritePath = vi.mocked(validateWritePath)

describe('installer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('installSkillFromGitHub', () => {
    it('should install skill successfully', async () => {
      mockedDownload.mockResolvedValue(undefined)
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return true
        if (String(p).includes('.tmp-')) return false
        return false
      })
      mockedParse.mockReturnValue({
        metadata: { name: 'my-new-skill', description: 'A new skill' },
        body: '# Instructions',
      })
      mockedGetHash.mockResolvedValue('commit-hash-123')

      const result = await installSkillFromGitHub('owner', 'repo', 'skills/my-new-skill')

      expect(result.success).toBe(true)
      expect(result.skillName).toBe('my-new-skill')
      expect(mockedDownload).toHaveBeenCalled()
      expect(mockedGetHash).toHaveBeenCalledWith('owner', 'repo', '')
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('source.json'),
        expect.stringContaining('"commit-hash-123"'),
        'utf-8'
      )
    })

    it('should record the per-skill tree sha and skip the commit API when available', async () => {
      mockedDownload.mockResolvedValue(undefined)
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return true
        if (String(p).includes('.tmp-')) return false
        return false
      })
      mockedParse.mockReturnValue({
        metadata: { name: 'my-new-skill', description: 'A new skill' },
        body: '# Instructions',
      })
      mockedGetTreeSha.mockResolvedValue('tree-sha-abc')

      const result = await installSkillFromGitHub('owner', 'repo', 'skills/my-new-skill')

      expect(result.success).toBe(true)
      expect(mockedGetTreeSha).toHaveBeenCalledWith('owner', 'repo', 'skills/my-new-skill')
      expect(mockedGetHash).not.toHaveBeenCalled()
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('source.json'),
        expect.stringContaining('"tree-sha-abc"'),
        'utf-8'
      )
    })

    it('should fail when SKILL.md is missing', async () => {
      mockedDownload.mockResolvedValue(undefined)
      mockedFs.existsSync.mockReturnValue(false)

      const result = await installSkillFromGitHub('owner', 'repo', 'bad-path')

      expect(result.success).toBe(false)
      expect(result.error).toContain('No SKILL.md found')
    })

    it('should fail when SKILL.md is invalid (parseSkillFile returns null)', async () => {
      mockedDownload.mockResolvedValue(undefined)
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return true
        return false
      })
      mockedParse.mockReturnValue(null)

      const result = await installSkillFromGitHub('owner', 'repo', '')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid SKILL.md')
    })
  })

  describe('installSkillFromMarketplace', () => {
    it('should install using detected path when skill name and directory differ by prefix', async () => {
      mockedDetect.mockResolvedValue([
        {
          name: 'react-best-practices',
          path: 'skills/react-best-practices',
          description: 'React guidance',
        },
      ])
      mockedDownload.mockResolvedValue(undefined)
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return true
        if (String(p).includes('.tmp-')) return false
        return false
      })
      mockedParse.mockReturnValue({
        metadata: { name: 'react-best-practices', description: 'React guidance' },
        body: '# Instructions',
      })
      mockedGetHash.mockResolvedValue('hash-123')

      const result = await installSkillFromMarketplace({
        id: 'vercel-labs/agent-skills/vercel-react-best-practices',
        skillId: 'vercel-react-best-practices',
        name: 'vercel-react-best-practices',
        installs: 100,
        source: 'vercel-labs/agent-skills',
      })

      expect(result.success).toBe(true)
      expect(mockedDownload).toHaveBeenCalledWith(
        'vercel-labs',
        'agent-skills',
        'skills/react-best-practices',
        expect.any(String)
      )
    })

    it('should try fallback skill paths before root path', async () => {
      mockedDetect.mockResolvedValue([])
      let requestedSkillPath = ''
      mockedDownload.mockImplementation(async (_owner, _repo, skillPath) => {
        requestedSkillPath = skillPath
      })

      mockedFs.existsSync.mockImplementation((p) => {
        const value = String(p)
        if (value.endsWith('SKILL.md')) return requestedSkillPath === 'skills/frontend-design'
        if (value.includes('.tmp-')) return false
        if (value.includes('source.json')) return false
        return false
      })
      mockedParse.mockReturnValue({
        metadata: { name: 'frontend-design', description: 'Frontend design guidance' },
        body: '# Instructions',
      })
      mockedGetHash.mockResolvedValue('hash-456')

      const result = await installSkillFromMarketplace({
        id: 'anthropics/skills/frontend-design',
        skillId: 'frontend-design',
        name: 'frontend-design',
        installs: 100,
        source: 'anthropics/skills',
      })

      expect(result.success).toBe(true)
      const calledPaths = mockedDownload.mock.calls.map(([, , skillPath]) => skillPath)
      expect(calledPaths[0]).toBe('skills/frontend-design')
    })
  })

  describe('deleteSkill', () => {
    it('should delete existing skill successfully', async () => {
      mockedFs.existsSync.mockReturnValue(true)

      const result = await deleteSkill('my-custom-skill')

      expect(result.success).toBe(true)
      expect(mockedFs.rmSync).toHaveBeenCalledWith(expect.stringContaining('my-custom-skill'), {
        recursive: true,
        force: true,
      })
    })

    it('should fail if skill directory does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false)

      const result = await deleteSkill('nonexistent-skill')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should reject empty skill name', async () => {
      const result = await deleteSkill('')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid skill name')
    })

    it('should reject path traversal skill names', async () => {
      const result = await deleteSkill('../outside')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid skill name')
      expect(mockedFs.rmSync).not.toHaveBeenCalled()
    })
  })

  describe('installSkillFromSandbox', () => {
    const sandboxWorkDir = '/tmp/sandbox/session-1'

    it('should install skill successfully from sandbox (happy path)', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockImplementation((p) => {
        const s = String(p)
        if (s.includes('SKILL.md')) return true
        // targetDir does not exist yet (no overwrite)
        if (s === '/mock/userData/skills/my-sandbox-skill') return false
        return true
      })
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      mockedParse.mockReturnValue({
        metadata: { name: 'my-sandbox-skill', description: 'A sandbox skill' },
        body: '# Skill instructions',
      })
      mockedFs.readdirSync.mockReturnValue([])

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(true)
      expect(result.skillName).toBe('my-sandbox-skill')
      expect(mockedFs.promises.cp).toHaveBeenCalledWith(
        expect.stringContaining('my-skill-dir'),
        expect.stringContaining('my-sandbox-skill'),
        { recursive: true }
      )
      // source.json should be written with type: 'chat'
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('source.json'),
        expect.stringContaining('"chat"'),
        'utf-8'
      )
    })

    it('should fail when sandbox is not initialized (no workingDirectory)', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'idle',
        workingDirectory: undefined,
      } as unknown as ReturnType<typeof getStatus>)

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Sandbox not initialized')
    })

    it('should fail on path traversal attempt', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: false, error: 'Invalid path: outside sandbox' })

      const result = await installSkillFromSandbox('../../etc', 'session-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('outside sandbox')
    })

    it('should fail when SKILL.md is missing', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return false
        return true
      })
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('No SKILL.md found')
    })

    it('should fail when SKILL.md is invalid (parseSkillFile returns null)', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('SKILL.md')) return true
        return true
      })
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      mockedParse.mockReturnValue(null)

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid SKILL.md')
    })

    it('should fail when directory is too large (>50MB)', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.statSync.mockImplementation((p) => {
        const s = String(p)
        // For isDirectory check on the resolved path
        if (s.endsWith('my-skill-dir') || s === `${sandboxWorkDir}/my-skill-dir`) {
          return { isDirectory: () => true } as ReturnType<typeof fs.statSync>
        }
        // For file size inside getDirectorySize
        return { isDirectory: () => false, size: 60 * 1024 * 1024 } as unknown as ReturnType<typeof fs.statSync>
      })
      mockedParse.mockReturnValue({
        metadata: { name: 'big-skill', description: 'Too large' },
        body: '# Big',
      })
      // getDirectorySize iterates entries
      mockedFs.readdirSync.mockReturnValue([
        { name: 'huge-file.bin', isDirectory: () => false, isFile: () => true },
      ] as unknown as ReturnType<typeof fs.readdirSync>)

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('too large')
    })

    it('should overwrite existing skill (rmSync called before copy)', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      mockedParse.mockReturnValue({
        metadata: { name: 'existing-skill', description: 'Overwrite me' },
        body: '# Instructions',
      })
      mockedFs.readdirSync.mockReturnValue([])

      const result = await installSkillFromSandbox('my-skill-dir', 'session-1')

      expect(result.success).toBe(true)
      // rmSync should be called on the target directory to remove existing skill
      expect(mockedFs.rmSync).toHaveBeenCalledWith(expect.stringContaining('existing-skill'), {
        recursive: true,
        force: true,
      })
      // Then copy should proceed
      expect(mockedFs.promises.cp).toHaveBeenCalled()
    })

    it('should write source.json with type "chat"', async () => {
      mockedGetStatus.mockReturnValue({
        state: 'initialized',
        workingDirectory: sandboxWorkDir,
      } as ReturnType<typeof getStatus>)
      mockedValidateWritePath.mockResolvedValue({ valid: true })
      mockedFs.existsSync.mockImplementation((p) => {
        const s = String(p)
        if (s.includes('SKILL.md')) return true
        if (s.includes('/skills/chat-skill')) return false
        return true
      })
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      mockedParse.mockReturnValue({
        metadata: { name: 'chat-skill', description: 'From chat' },
        body: '# Body',
      })
      mockedFs.readdirSync.mockReturnValue([])

      await installSkillFromSandbox('my-skill-dir', 'session-1', 'https://example.com/skill.tar.gz')

      const writeCall = mockedFs.writeFileSync.mock.calls.find((call) => String(call[0]).includes('source.json'))
      expect(writeCall).toBeDefined()
      const written = JSON.parse(writeCall![1] as string)
      expect(written.type).toBe('chat')
      expect(written.repo).toBe('https://example.com/skill.tar.gz')
      expect(written.installedAt).toBeDefined()
    })
  })

  describe('checkForUpdates', () => {
    it('should reject invalid skill names', async () => {
      const result = await checkForUpdates('../outside')

      expect(result.hasUpdate).toBe(false)
      expect(result.error).toContain('Invalid skill name')
    })

    it('should detect available update when hashes differ', async () => {
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          type: 'github',
          repo: 'owner/repo',
          skillPath: 'skills/test',
          commitHash: 'old-hash-111',
        })
      )
      mockedGetHash.mockResolvedValue('new-hash-222')

      const result = await checkForUpdates('test-skill')

      expect(result.hasUpdate).toBe(true)
      expect(result.currentHash).toBe('old-hash-111')
      expect(result.latestHash).toBe('new-hash-222')
    })

    it('should report no update when hashes match', async () => {
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          type: 'github',
          repo: 'owner/repo',
          commitHash: 'same-hash',
        })
      )
      mockedGetHash.mockResolvedValue('same-hash')

      const result = await checkForUpdates('test-skill')

      expect(result.hasUpdate).toBe(false)
    })

    it('should compare the per-skill tree sha and ignore unrelated repo commits', async () => {
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          type: 'github',
          repo: 'owner/repo',
          skillPath: 'skills/test',
          treeSha: 'tree-old',
        })
      )
      mockedGetTreeSha.mockResolvedValue('tree-new')

      const result = await checkForUpdates('test-skill')

      expect(mockedGetTreeSha).toHaveBeenCalledWith('owner', 'repo', 'skills/test')
      // The commit API (which would false-positive on unrelated commits) is not used.
      expect(mockedGetHash).not.toHaveBeenCalled()
      expect(result.hasUpdate).toBe(true)
      expect(result.currentHash).toBe('tree-old')
      expect(result.latestHash).toBe('tree-new')
    })

    it('should report no update when the tree sha matches', async () => {
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          type: 'github',
          repo: 'owner/repo',
          skillPath: 'skills/test',
          treeSha: 'tree-same',
        })
      )
      mockedGetTreeSha.mockResolvedValue('tree-same')

      const result = await checkForUpdates('test-skill')

      expect(result.hasUpdate).toBe(false)
      expect(mockedGetHash).not.toHaveBeenCalled()
    })

    it('should return error when source.json is missing', async () => {
      mockedFs.existsSync.mockReturnValue(false)
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = await checkForUpdates('orphan-skill')

      expect(result.hasUpdate).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
