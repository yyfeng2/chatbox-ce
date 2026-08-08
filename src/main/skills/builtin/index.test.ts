import { describe, expect, it } from 'vitest'
import { builtinSkills } from './index'

describe('builtinSkills', () => {
  it('only includes practical built-in skills', () => {
    expect(builtinSkills.map((item) => item.metadata.name)).toEqual(['data-analysis', 'frontend-design'])
  })

  it('keeps data analysis aligned with the sandbox harness', () => {
    const skill = builtinSkills.find((item) => item.metadata.name === 'data-analysis')

    expect(skill).toBeDefined()
    expect(skill?.body).toContain('code_execution')
    expect(skill?.body).toContain('Node.js, PowerShell on Windows, or Bash')
    expect(skill?.body).toContain('create_download')
    expect(skill?.body).toContain('Python, pandas, matplotlib, R, and system package managers are not available')
  })
})
