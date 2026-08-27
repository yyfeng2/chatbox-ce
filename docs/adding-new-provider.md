# Provider 系统与自动义供应商（Registry 架构）

> **Last updated: 2026-08**
>
> ⚠️ **定制版声明**：本 fork 已**移除 Chatbox AI 官方服务并清空全部内置 model provider**。
> `src/shared/providers/definitions/` 下**不再有任何 provider 定义文件**，`defineProvider()` 仅在
> `registry.ts` 中定义但已无内置调用。系统当前只保留 **自定义供应商（custom）** 与 **OAuth** 体系。
> 因此本文档说明的是定制版**新增用户自定义 provider** 的方式，不再涉及「添加内置 provider」。

## 概述

Chatbox 的 provider 系统基于**注册表（Registry）模式**。核心位于 `src/shared/providers/registry.ts`：

| 函数 | 用途 |
|------|------|
| `defineProvider(def)` | 声明式注册一个内置供应商（定制版已无调用） |
| `getProviderDefinition(id)` | 按 ID 查找已注册供应商 |
| `getSystemProviders()` | 获取供 UI 显示的供应商基础信息列表 |

> 内置供应商通过 `src/shared/providers/index.ts` 的**副作用导入**触发注册（原项目如此）。
> **定制版已清空该机制**——`index.ts` 仅 re-export registry / custom，不再副作用导入任何定义文件。

## 用户自动义供应商（custom）

定制版的用户**无需修改代码**即可添加供应商。整个体系围绕 `createCustomProviderModel()`（`src/shared/providers/utils.ts`）运行。

用户在 **设置 → Model Provider → 自定义 Provider** 中添加：

- 指定 **协议类型**（`ModelProviderType`）：`OpenAI`（默认）/ `Claude` / `Gemini` / `OpenAIResponses`
- 填写 **API 地址（apiHost）** 与 **API Key**
- 声明预置模型列表（modelId / contextWindow / maxOutput / capabilities）

运行时，`getModel()`（`src/shared/providers/index.ts`）流程：

1. 按 provider ID 查找内置 registry —— 定制版通常不命中
2. 未命中 → 走 `createCustomProviderModel()`，根据 `ModelProviderType` 分发到对应 Custom 模型类
3. 均未匹配 → 抛错

`createCustomProviderModel()` 的分发（`src/shared/providers/utils.ts`）：

| 协议类型 | 模型类 |
|---------|--------|
| `Claude` | `CustomClaude` |
| `Gemini` | `CustomGemini` |
| `OpenAIResponses` | `CustomOpenAIResponses` |
| `OpenAI`（默认） | `CustomOpenAI` |

### 自动义供应商 ID 约束

- 自建 provider 的 `id` 必须是**全局唯一**字符串
- 自建 provider 的 `id` **不允许与任意内置 provider ID 相同**
- 导入配置声明 `isCustom: true` 且与 builtin 冲突时，系统拒绝该配置

原因是 provider ID 同时用于设置存储、运行时 provider 路由、OAuth 共享映射和设置页导航。若 builtin/custom 共用 ID，会出现"展示的是一个 provider、实际请求走的是另一个 provider"的控制面歧义。

## 模型注册表（models.dev 富化）

即使内置 provider 已清空，**模型注册表（model-registry）体系仍然保留**，为自定义供应商的模型提供能力元数据富化：

- `src/shared/model-registry/`：供应商 ID 映射（`provider-mapping.ts`）、模型匹配与富化（`enrich.ts`）、数据转换（`transform.ts`）、类型（`types.ts`）、构建时快照（`snapshot.generated.ts`）
- `src/renderer/packages/model-registry/`：网络请求与多级缓存（`fetch.ts`）、列表级富化与新模型发现（`enrich.ts`）、公开 API（`index.ts`）

`enrichModelFromRegistry()` 的富化策略：`capabilities` / `contextWindow` / `maxOutput` 由 registry **覆写**（更权威）；`nickname` / `type` 仅在缺失时填充（保留用户自定义）。

> 相关脚本：`pnpm run generate:model-snapshot`（`scripts/generate-model-snapshot.ts`）重新生成构建时快照。

## OAuth 认证集成

OAuth 基础设施同样保留，供自定义/内置 OAuth 供应商使用。实现横跨三层：

- `src/main/oauth/`：主进程 OAuth provider 注册表、IPC handler、回调监听与 token 刷新（provider：openai、anthropic、github-copilot、minimax、qwen）
- `src/renderer/hooks/useOAuth.ts`：设置页登录、切换认证模式、自动刷新 token
- `src/shared/oauth/`：共享的 provider mapping（`provider-mapping.ts`）、credential manager、OAuth fetch 封装
- `src/shared/oauth/provider-mapping.ts` 的 `OAUTH_PROVIDER_MAP`：定义 Chatbox provider ↔ OAuth provider 映射与共享凭证关系（如 `openai-responses -> openai`）

三种 OAuth 流程：

1. **Callback flow**（OpenAI）：本地 callback server 收 `code` 完成 token exchange
2. **Code-paste flow**（Anthropic）：用户粘贴授权码
3. **Device-code flow**（GitHub Copilot）：用户在浏览器输入 `user_code`

> OAuth token refresh / clear 只更新共享凭证存储，不联动修改其它 provider 的 `activeAuthMode`（认证模式互相独立）。

## 测试

1. **TypeScript check:** `pnpm run check`
2. **Lint:** `pnpm run lint`
3. **开发模式:** `pnpm run dev`
4. **在应用内验证:** 添加自定义 Provider → 配置 API Key → 模型选择器应能列出模型 → 聊天功能正常

## 相关文档

- [AI 供应商系统（Technical）](./technical/ai-providers.md) —— registry / OAuth 架构细节
- [README（定制版说明）](../README.md)
