import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loggerWarn, userDataRoot } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  userDataRoot: { current: '' },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataRoot.current),
  },
}))

vi.mock('../util', () => ({
  getLogger: () => ({
    warn: loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('./builtin', () => ({
  builtinSkills: [],
}))

import { getBuiltinSkillsDir, syncBuiltinSkills } from './builtin-sync'

describe('syncBuiltinSkills', () => {
  beforeEach(() => {
    userDataRoot.current = fs.mkdtempSync(path.join(os.tmpdir(), 'chatbox-builtin-skills-'))
    loggerWarn.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(userDataRoot.current, { recursive: true, force: true })
  })

  it('syncs multi-file skills and matches backend hash order', async () => {
    const hash = '314490b1a5c9c70658abacaa2055e85de940100f137648df4258fd2cb583e903'
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).endsWith('/api/builtin_skills')) {
          return Response.json({
            data: [{ name: 'multi-file-skill', description: 'desc', version: 2, hash, updated_at: 1 }],
          })
        }
        if (String(url).endsWith('/api/builtin_skills/multi-file-skill')) {
          return Response.json({
            data: {
              name: 'multi-file-skill',
              description: 'desc',
              body: 'body',
              files: [
                { path: 'LICENSE', content: 'license\n', hash: 'hash-license', size: 8 },
                { path: 'assets/a.txt', content: 'asset\n', hash: 'hash-asset', size: 6 },
              ],
              version: 2,
              hash,
            },
          })
        }
        return new Response(null, { status: 404 })
      })
    )

    await expect(syncBuiltinSkills()).resolves.toBe(true)

    const skillDir = path.join(getBuiltinSkillsDir(), 'multi-file-skill')
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).toContain('body')
    expect(fs.readFileSync(path.join(skillDir, 'LICENSE'), 'utf-8')).toBe('license\n')
    expect(fs.readFileSync(path.join(skillDir, 'assets/a.txt'), 'utf-8')).toBe('asset\n')
    expect(loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('hash mismatch'))
  })

  it('rejects normalized reserved file paths before replacing the existing snapshot', async () => {
    const builtinDir = getBuiltinSkillsDir()
    const skillDir = path.join(builtinDir, 'multi-file-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'old skill body', 'utf-8')
    fs.writeFileSync(
      path.join(builtinDir, 'manifest.json'),
      JSON.stringify({
        skills: {
          'multi-file-skill': { version: 1, hash: 'old-hash', updatedAt: 1, origin: 'remote' },
        },
        syncedAt: 1,
      }),
      'utf-8'
    )

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).endsWith('/api/builtin_skills')) {
          return Response.json({
            data: [{ name: 'multi-file-skill', description: 'desc', version: 2, hash: 'new-hash', updated_at: 2 }],
          })
        }
        if (String(url).endsWith('/api/builtin_skills/multi-file-skill')) {
          return Response.json({
            data: {
              name: 'multi-file-skill',
              description: 'desc',
              body: 'new body',
              files: [{ path: './SKILL.md', content: 'malicious overwrite', hash: 'hash-skill', size: 19 }],
              version: 2,
              hash: 'new-hash',
            },
          })
        }
        return new Response(null, { status: 404 })
      })
    )

    await expect(syncBuiltinSkills()).resolves.toBe(false)

    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).toBe('old skill body')
    const manifest = JSON.parse(fs.readFileSync(path.join(builtinDir, 'manifest.json'), 'utf-8'))
    expect(manifest.skills['multi-file-skill'].hash).toBe('old-hash')
  })

  it('rejects case-variant reserved file paths (case-insensitive filesystems)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).endsWith('/api/builtin_skills')) {
          return Response.json({
            data: [{ name: 'multi-file-skill', description: 'desc', version: 2, hash: 'new-hash', updated_at: 2 }],
          })
        }
        if (String(url).endsWith('/api/builtin_skills/multi-file-skill')) {
          return Response.json({
            data: {
              name: 'multi-file-skill',
              description: 'desc',
              body: 'real body',
              files: [{ path: 'skill.md', content: 'malicious overwrite', hash: 'hash-skill', size: 19 }],
              version: 2,
              hash: 'new-hash',
            },
          })
        }
        return new Response(null, { status: 404 })
      })
    )

    await expect(syncBuiltinSkills()).resolves.toBe(false)

    const skillDir = path.join(getBuiltinSkillsDir(), 'multi-file-skill')
    // 整批因非法文件抛错回滚：目录未创建，恶意内容未落地
    expect(fs.existsSync(skillDir)).toBe(false)
  })
})
