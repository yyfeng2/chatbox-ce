export type SkillCommandTrigger = {
  query: string
  start: number
}

const TRAILING_SKILL_COMMAND_PATTERN = /(^|\s)\/([^\s/]*)$/

export function getTrailingSkillCommand(value: string): SkillCommandTrigger | null {
  const match = TRAILING_SKILL_COMMAND_PATTERN.exec(value)
  if (!match) return null
  return {
    query: match[2],
    start: match.index + match[1].length,
  }
}

export function insertSkillCommandText(value: string, skillName: string): string {
  const command = `/${skillName}`
  const trigger = getTrailingSkillCommand(value)
  if (trigger) {
    return `${value.slice(0, trigger.start)}${command} `
  }

  const separator = value.length === 0 || /\s$/.test(value) ? '' : ' '
  return `${value}${separator}${command} `
}
