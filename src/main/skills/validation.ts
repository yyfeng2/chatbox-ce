export const SKILL_NAME_RE = /^[a-z0-9-]+$/

export function isValidSkillName(value: string): boolean {
  return value.length > 0 && value.length <= 64 && SKILL_NAME_RE.test(value)
}

/**
 * Normalize a Claude Code skill name to Chatbox's kebab-case format.
 * Prefers the directory name (already kebab-case in most Claude skills),
 * falls back to normalizing the frontmatter name.
 */
export function normalizeClaudeSkillName(rawName: string, dirName: string): string {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)

  const fromDir = normalize(dirName)
  if (fromDir && isValidSkillName(fromDir)) return fromDir

  const fromName = normalize(rawName)
  if (fromName && isValidSkillName(fromName)) return fromName

  return ''
}
