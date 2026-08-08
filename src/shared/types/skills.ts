import { z } from 'zod'

export const DEFAULT_ENABLED_BUILTIN_SKILL_NAMES = [] as const

// ===== Skill Source Types =====

/**
 * SkillSource: Metadata about where a skill comes from
 * - type: Source type (builtin, local, marketplace, github, chat, claude-code, agents)
 *   - claude-code: discovered from Claude Code's ~/.claude/skills
 *   - agents: discovered from the shared agent skills dir ~/.agents/skills (codex, etc.)
 * - repo: Optional repository URL or identifier
 * - commitHash: Optional repo HEAD commit hash (legacy version tracking)
 * - treeSha: Optional git subtree SHA scoped to skillPath (preferred for update checks)
 * - installedAt: Optional ISO timestamp of installation
 * - skillPath: Optional file system path to skill
 */
export interface SkillSource {
  type: 'builtin' | 'local' | 'marketplace' | 'github' | 'chat' | 'claude-code' | 'agents'
  repo?: string
  commitHash?: string
  treeSha?: string
  installedAt?: string
  skillPath?: string
}

/**
 * MarketplaceSkill: Skill metadata from marketplace
 * - id: Unique marketplace identifier
 * - skillId: Skill identifier
 * - name: Display name
 * - installs: Number of installations
 * - source: Source identifier or URL
 * - description: Optional description
 */
export interface MarketplaceSkill {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
  description?: string
}

// ===== Skill Metadata Types =====

/**
 * SkillMetadata: Core metadata for a skill from agentskills.io spec
 * - name: 1-64 chars, lowercase + hyphens only
 * - description: 1-1024 chars
 * - license: Optional license identifier
 * - compatibility: Optional compatibility info (1-500 chars)
 * - metadata: Optional arbitrary metadata key-value pairs
 * - allowedTools: Optional list of allowed tool names
 */
export interface SkillMetadata {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
}

/**
 * SkillInfo: Extended skill metadata with runtime information
 * - Extends SkillMetadata with path and isBuiltin
 * - path: File system path to the skill
 * - isBuiltin: Whether this is a built-in skill
 * - source: Optional source metadata (builtin, local, marketplace, github, chat, claude-code)
 */
export interface SkillInfo extends SkillMetadata {
  path: string
  isBuiltin: boolean
  source?: SkillSource
}

// ===== Zod Schemas =====

/**
 * Zod schema for skill settings
 * - enabledSkillNames: Array of custom skill names to enable
 * - translationEnabled: Whether translation feature is enabled for skills
 * - builtinDefaultsInitialized: Whether one-time default built-in skills have been applied
 * - appliedDefaultBuiltinSkillNames: Built-in defaults that have already been auto-enabled
 */
export const SkillSettingsSchema = z.object({
  enabledSkillNames: z.array(z.string()).default([...DEFAULT_ENABLED_BUILTIN_SKILL_NAMES]),
  translationEnabled: z.boolean().default(true),
  builtinDefaultsInitialized: z.boolean().default(false),
  appliedDefaultBuiltinSkillNames: z.array(z.string()).default([...DEFAULT_ENABLED_BUILTIN_SKILL_NAMES]),
})

// ===== Type Exports =====

export type SkillSettings = z.infer<typeof SkillSettingsSchema>
