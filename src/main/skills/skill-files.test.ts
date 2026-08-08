import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectSkillFiles, MAX_SKILL_FILES } from './skill-files'

let skillDir = ''

function write(relative: string, content = 'x') {
  const target = path.join(skillDir, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf-8')
}

describe('collectSkillFiles', () => {
  beforeEach(() => {
    skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatbox-skill-files-'))
    write('SKILL.md', '# skill')
  })

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true })
  })

  it('collects top-level files and whitelisted subdirs, excluding SKILL.md/source.json', () => {
    write('LICENSE', 'license')
    write('source.json', '{}')
    write('references/checklist.md')
    write('scripts/validate.mjs')
    write('assets/logo.png')

    const { files, truncated } = collectSkillFiles(skillDir)

    expect(truncated).toBe(false)
    expect(files).toEqual(['LICENSE', 'assets/logo.png', 'references/checklist.md', 'scripts/validate.mjs'])
    expect(files).not.toContain('SKILL.md')
    expect(files).not.toContain('source.json')
  })

  it('does not descend into non-whitelisted top-level directories (e.g. node_modules)', () => {
    write('references/a.md')
    write('node_modules/pkg/index.js')
    write('node_modules/pkg/nested/deep.js')
    write('.git/config')

    const { files } = collectSkillFiles(skillDir)

    expect(files).toEqual(['references/a.md'])
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false)
    expect(files.some((f) => f.startsWith('.git/'))).toBe(false)
  })

  it('caps the file list at MAX_SKILL_FILES and flags truncation', () => {
    for (let i = 0; i < MAX_SKILL_FILES + 50; i += 1) {
      write(`references/file-${String(i).padStart(4, '0')}.md`)
    }

    const { files, truncated } = collectSkillFiles(skillDir)

    expect(files.length).toBe(MAX_SKILL_FILES)
    expect(truncated).toBe(true)
  })
})
