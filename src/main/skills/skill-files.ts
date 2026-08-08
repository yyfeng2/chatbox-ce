import fs from 'node:fs'
import path from 'node:path'

/** 单个 skill 最多列举的附属文件数量，避免大体积 skill 把过多路径塞进 session 数据。 */
export const MAX_SKILL_FILES = 200

/** 允许递归收录的白名单子目录，与 Agent Skills 约定一致（其余顶层目录不深入）。 */
const SKILL_FILE_SUBDIRS = new Set(['references', 'scripts', 'assets'])

/**
 * 列出 skill 目录下可供模型引用的附属文件（相对 POSIX 路径）。
 *
 * 只收录顶层文件与白名单子目录（assets/references/scripts）内的文件，并限制总数：
 * `skills:load` 对所有来源（含从 GitHub 仓库安装的 skill）生效，若无限制地递归整个目录，
 * 一个携带 node_modules/大仓库的 skill 会把上千条路径经 load_skill 写进 session/message，
 * 违反「tool 结果要小 / session 数据要紧凑」的约定。
 */
export function collectSkillFiles(skillPath: string): { files: string[]; truncated: boolean } {
  const files: string[] = []
  let truncated = false

  const pushFile = (entryPath: string): void => {
    const relativePath = path.relative(skillPath, entryPath)
    if (relativePath === 'SKILL.md' || relativePath === 'source.json') return
    files.push(relativePath.split(path.sep).join('/'))
  }

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_SKILL_FILES) {
        truncated = true
        return
      }
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      pushFile(entryPath)
    }
  }

  for (const entry of fs.readdirSync(skillPath, { withFileTypes: true })) {
    if (files.length >= MAX_SKILL_FILES) {
      truncated = true
      break
    }
    const entryPath = path.join(skillPath, entry.name)
    if (entry.isDirectory()) {
      if (SKILL_FILE_SUBDIRS.has(entry.name)) walk(entryPath)
      continue
    }
    if (!entry.isFile()) continue
    pushFile(entryPath)
  }

  files.sort()
  return { files, truncated }
}
