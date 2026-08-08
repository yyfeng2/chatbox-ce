import type { SkillMetadata } from '@shared/types/skills'
import * as dataAnalysis from './data-analysis'
import * as frontendDesign from './frontend-design'

/**
 * BuiltinSeed: 随客户端打包的官方内置 skill 种子，用作首启种子与离线 fallback。
 * 运行时这些种子会被写入本地快照目录（userData/builtin-skills），
 * 之后由 builtin-sync 从后端拉取更新并覆盖快照。
 */
export interface BuiltinSeed {
  metadata: SkillMetadata
  body: string
  version: number
}

export const builtinSkills: BuiltinSeed[] = [
  { metadata: dataAnalysis.metadata, body: dataAnalysis.body, version: 1 },
  { metadata: frontendDesign.metadata, body: frontendDesign.body, version: 1 },
]
