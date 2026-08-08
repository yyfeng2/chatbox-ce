# Agent Skills 技术设计

> Last updated: 2026-02

本文档整理 `feat/skills` 分支合并后的技能系统技术方案，并归档历史设计中的关键决策、实现约束和后续演进方向。

---

## 系统目标

Agent Skills 的核心目标是以低耦合方式扩展模型能力：

- 通过标准 `SKILL.md` 格式发现和解析技能
- 通过 Settings + Session 两级配置控制技能启用范围
- 通过工具调用进行按需加载，避免一次性注入所有技能全文

## 架构分层

| 层次 | 位置 | 职责 |
|------|------|------|
| Main 进程技能层 | `src/main/skills/` | 发现技能目录、解析 `SKILL.md`、注册技能 IPC |
| Shared 类型层 | `src/shared/types/skills.ts` | 技能元数据与配置 Schema |
| Renderer 控制层 | `src/renderer/packages/skills/controller.ts` | 对 IPC 提供类型化封装 |
| 会话工具构建层 | `src/renderer/stores/session/tools-builder.ts` | 拼装 `<available_skills>` 与 `load_skill` 工具 |
| UI 层 | Settings + InputBox | 全局启用与会话级覆盖 |

## 数据模型与配置

### 全局配置

全局技能开关与启用列表由设置存储管理，使用版本迁移保证向后兼容。

- `enabledBuiltinSkills`: 启用的内置技能名
- `enabledSkillNames`: 启用的用户技能名

### 会话级覆盖

会话模型增加可选字段（与 `copilotId` 的可选字段模式一致）：

- `enabledSkillNames?: string[]`

语义为“会话级完整覆盖全局技能列表”；当值为 `undefined` 时回退到全局配置。

## 关键流程

### 1) 技能发现与解析（Main）

1. 扫描用户数据目录下 `skills/` 子目录。
2. 对每个候选目录读取 `SKILL.md`。
3. 解析 YAML frontmatter 与正文，提取 `name`、`description` 等元数据。
4. 过滤无效技能（格式错误、缺关键字段），保留可用技能清单。

### 2) 上下文注入与工具注册（Renderer）

`buildToolsForSession()` 中执行以下动作：

1. 计算当前会话有效技能集合（全局或会话覆盖）。
2. 生成 `<available_skills>` XML 注入到 `instructions`。
3. 在支持 Tool Use 的模型上注册 `load_skill`（按名称加载技能正文）。
4. 模型不支持 Tool Use 时，仅注入 XML 元数据，不注册技能工具。

该设计遵循“渐进披露（progressive disclosure）”原则。

### 3) UI 管理路径

- Settings Skills 页面：全局启用/禁用、目录打开、刷新扫描
- InputBox SkillsMenu：当前会话启用列表覆盖

## IPC 通道（技能相关）

当前已归档的技能 IPC 能力包括：

- `skills:discover`
- `skills:load`
- `skills:get-directory`
- `skills:open-directory`
- `skills:execute-script`

## 已归档决策

- 技能规范遵循 agentskills.io（目录 + `SKILL.md`）
- 技能激活采用 `load_skill` + `<available_skills>` 模式
- 内置技能以代码常量内置，而非文件系统预置
- 功能桌面端优先，非桌面端通过 feature flag 降级隐藏
- 会话级技能选择持久化在 SessionSchema（而非仅 UI 临时态）

## 错误处理与边界条件

归档记录中的关键边界处理要点：

- 无效 `SKILL.md` 解析失败时跳过，不中断主流程
- 缺失技能目录时自动创建
- 模型无 Tool Use 能力时仅注入元数据，不注册技能工具
- 被删除技能被引用时返回可读错误，避免会话崩溃

## 演进计划（来自 skills-management-panel 计划）

以下项已整理为后续技术方向：

- 市场检索与安装（skills.sh + curated list）
- GitHub API 安装器与 `source.json` 安装清单
- 更新检查（基于远端 hash/commit 对比）
- 可复用翻译服务（自由翻译链路 + 缓存）

上述内容在合并分支中作为 roadmap 保留，不在本次“已合并能力”范围内默认承诺。

## 相关文档

- 产品说明：[`docs/product/agent-skills.md`](../product/agent-skills.md)
- 工具系统：[`./tools-and-integrations.md`](./tools-and-integrations.md)
