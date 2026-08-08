import type { SkillInfo } from '@shared/types/skills'
import { describe, expect, it } from 'vitest'
import type { SkillRegistryEntry } from './registries'
import {
  buildDetailsText,
  getConflictingInstalledSkill,
  getEntrySkillNameCandidates,
  isSkillEntryInstalled,
  normalizeSkillSource,
} from './SkillsSpotlight'

describe('buildDetailsText', () => {
  it('should put source first, followed by description', () => {
    const result = buildDetailsText('anthropics/skills', '', 'A great skill', false)
    expect(result).toBe('anthropics/skills · A great skill')
  })

  it('should include translated description before original when translation enabled', () => {
    const result = buildDetailsText('obra/superpowers', '一个很棒的技能', 'A great skill', true)
    expect(result).toBe('obra/superpowers · 一个很棒的技能 · A great skill')
  })

  it('should fall back to original description when translation is disabled', () => {
    const result = buildDetailsText('vercel-labs/skills', '翻译', 'Original', false)
    expect(result).toBe('vercel-labs/skills · Original')
  })

  it('should handle empty translated description', () => {
    const result = buildDetailsText('some/repo', '', 'Description', true)
    expect(result).toBe('some/repo · Description')
  })

  it('should handle empty original description', () => {
    const result = buildDetailsText('some/repo', '', '', false)
    expect(result).toBe('some/repo')
  })
})

describe('skill marketplace installed matching', () => {
  const installedVercelSkill: SkillInfo = {
    name: 'vercel-react-best-practices',
    description: 'React and Next.js performance optimization guidelines from Vercel Engineering.',
    path: '/tmp/skills/vercel-react-best-practices',
    isBuiltin: false,
    source: {
      type: 'marketplace',
      repo: 'vercel-labs/agent-skills',
      skillPath: 'skills/vercel-react-best-practices',
    },
  }

  const popularVercelEntry: SkillRegistryEntry = {
    name: 'vercel-react-best-practices',
    skillId: 'react-best-practices',
    title: 'Vercel React Best Practices',
    description: 'React guidance',
    source: 'vercel-labs/agent-skills',
    homepage: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices',
  }

  it('uses registry name and skillId aliases as deduplicated skill name candidates', () => {
    expect(getEntrySkillNameCandidates(popularVercelEntry)).toEqual([
      'vercel-react-best-practices',
      'react-best-practices',
    ])
  })

  it('marks the Vercel popular entry installed even when skillId is an alias', () => {
    expect(isSkillEntryInstalled([installedVercelSkill], popularVercelEntry)).toBe(true)
  })

  it('normalizes GitHub URL and owner/repo sources before comparing', () => {
    expect(normalizeSkillSource('https://github.com/Vercel-Labs/agent-skills.git')).toBe('vercel-labs/agent-skills')
    expect(
      isSkillEntryInstalled(
        [
          {
            ...installedVercelSkill,
            source: { type: 'github', repo: 'https://github.com/vercel-labs/agent-skills.git' },
          },
        ],
        popularVercelEntry
      )
    ).toBe(true)
  })

  it('treats same-name skills from a different source as conflicts', () => {
    const localSkill: SkillInfo = {
      ...installedVercelSkill,
      source: { type: 'github', repo: 'someone-else/agent-skills' },
    }

    expect(isSkillEntryInstalled([localSkill], popularVercelEntry)).toBe(false)
    expect(getConflictingInstalledSkill([localSkill], popularVercelEntry)).toBe(localSkill)
  })
})
