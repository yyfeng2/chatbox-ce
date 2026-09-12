> **⚠️ 本定制版声明**
>
> 此文档描述**原始 Chatbox 项目**的功能设计。本仓库为本地化定制分支，已**彻底移除 Chatbox AI 官方服务依赖并清空全部自带 provider**，因此本文档中涉及 ChatboxAI 官方后端、自带供应商及已删除功能（VibeDrop / chatbox-cli / 官方 Web Search / 远程知识库解析等）的部分**不再适用**，仅作历史参考。具体差异请参阅 [README](../README.md) 的定制版说明。

---

# 思考控制（Reasoning Control）

> Last updated: 2026-06

本文梳理「思考控制」（即推理强度 / thinking effort）的**支持条件判定逻辑**，以及参数从 UI 选择到请求发出的完整流转，供后续维护参考。

核心源码：

| 文件 | 职责 |
|------|------|
| `src/shared/utils/reasoning-control.ts` | 支持条件判定、档位与 providerOptions 生成、请求侧剥离 helper |
| `src/renderer/components/InputBox/ReasoningControlButton.tsx` | 思考控制下拉控件（UI） |
| `src/renderer/components/InputBox/useReasoningControlState.ts` | 控件状态、按会话持久化 `providerOptions` |
| `src/shared/models/abstract-ai-sdk.ts` | 请求边界统一兜底（`resolveCallSettings`） |

---

## 1. 唯一可靠的判定信号：provider + 写死的 model id / 前缀

**不要用模型的 `reasoning` 能力标志（`isSupportReasoning()` / `capabilities` 含 `'reasoning'`）来判断是否支持思考控制——这个值不可靠。** 部分确实支持思考的模型（例如 `qwen3.x`）在 registry 元数据里并没有 `reasoning` 能力标志（`src/shared/providers/definitions/qwen.ts` 里 `qwen3.7-max` 只有 `['tool_use']`）。

唯一可靠的判定是 **provider + 写死的 model id 列表 / 正则前缀**，由 `getReasoningControlCapabilities(provider, model)` 统一实现。UI 是否显示控件、请求侧是否保留参数，都必须以它为准，保证两端一致。

**唯一例外：自定义（custom）供应商的 chat/task 模型不做任何 id 判定，一律开放思考控制。** 自定义供应商代理的是用户自建的端点（vLLM / Ollama / SiliconFlow / 各类网关），其模型 id 无法用内置正则分类；而 OpenAI 兼容端点统一接受 `reasoning_effort` 档位（`none / minimal / low / medium / high / xhigh / max`），与模型是否为「推理模型」无关。因此对自定义供应商直接按 API 风格（effectiveProvider）给出控件与 wire 格式，不需要模型勾选 `reasoning` 能力标志。非 chat 类型（image / embedding / rerank）保持无控件。

**UI 档位收窄（CE 定制）**：当前大多数模型只支持三个强度级别 `low / high / max`，`getReasoningControlOptions` 对 effort 家族（`openai-effort` / `anthropic-effort` / `anthropic-adaptive-effort` / `deepseek-effort`）只提供 `default + low/high/max`（不再提供 `off` / `medium` / `xhigh` 菜单项）；budget/level 家族（Gemini / Qwen）保持原生 low/medium/high 刻度，简单开关为 default/on。**off 档已从所有菜单移除**（wire 层与 `ReasoningControlLevel` 类型保留完整枚举：旧版本写入的 off 值仍正确走关闭 wire 并原样回显）。

> **注意**：自定义供应商上模型 id 与 API 风格即使「不匹配」（例如 Claude/Grok/Qwen 名字的模型挂在 openai 风格上）也不禁用——判定直接命中自定义分支，禁用（disabledReason）逻辑对其不生效，wire 以实际配置的 API 风格为准。这是有意为之：用户给自定义供应商配了什么端点，就该按什么协议发。

```ts
getReasoningControlCapabilities(provider, model): {
  supported: boolean
  kind: 'anthropic-adaptive-effort' | 'anthropic-effort' | 'budget' | 'level'
      | 'openai-effort' | 'openrouter-reasoning' | 'toggle' | 'xai-effort'
  disabledReason?: ...
}
```

`provider` 是 provider id 字符串（与 `ModelProviderEnum` 值比较，如 `'chatbox-ai'`、`'qwen'`），`model` 是 `ProviderModelInfo`（含 `modelId`、`apiStyle`）。

---

## 2. effectiveProvider：apiStyle 映射（含自建供应商）

对 **ChatboxAI** 和**自建供应商（custom）**，模型可能以任意 API 风格代理后端模型，因此用 `apiStyle` 推导「有效供应商」（`getEffectiveProvider`）：

| `apiStyle` | effectiveProvider |
|-----------|-------------------|
| `anthropic` | Claude |
| `google` | Gemini |
| `openai-responses` | OpenAIResponses |
| 其它 / 未设置 | OpenAI |

是否走 apiStyle 映射由 `usesModelApiStyleForReasoning(provider)` 决定，返回 `true` 的情况：

- `provider === ChatboxAI`
- `provider === Custom`（字面枚举值 `'custom'`）
- **`provider` 不是任何内置供应商 id**（即用户自建供应商，其 id 是任意值）—— 通过 `isCustomProviderId()`（不在 `Object.values(ModelProviderEnum)` 中）判断

> **代理型供应商的判定原则：api style（= provider type）+ model id。** 这类供应商的 id 不带内置语义，不能用 id 直接匹配模型列表；必须先由 provider type 决定 api style，再用 api style 推导 effectiveProvider，最后用 model id 命中写死的列表。涵盖：
> - **自建供应商（custom）**：id 任意，`isCustomProviderId` 命中（不在 `ModelProviderEnum`）。
> - **内置代理供应商**：如 `github-copilot`（id 不在 `ModelProviderEnum`，type 为 OpenAI，代理 gpt/claude/gemini 等）——同样被 `isCustomProviderId` 命中，按 apiStyle 判定。
>
> apiStyle 兜底两端共用 `src/shared/providers/api-style.ts` 的 `API_STYLE_BY_PROVIDER_TYPE` / `apiStyleFromProviderType`，**单一来源**：
> - UI 侧：`useReasoningControlState` 的 `withProviderApiStyleFallback`。
> - 请求侧：`getModel` 的 `withReasoningApiStyle`（registry + custom 两条分支都盖），保证 UI 与 gate 解析出同一 effectiveProvider。
>
> OpenRouter 例外，始终保持自身；其它内置供应商（id 在枚举内）直接用自身作为 effectiveProvider，apiStyle 被忽略，盖值是无副作用的 no-op。
> `isOpenAICompatibleApiStyle` 同样对 ChatboxAI 和上述代理型供应商生效（用于 DeepSeek 等按 model id 检测的思考模型）。

---

## 3. 各 effectiveProvider 的支持条件

`getReasoningControlCapabilities` 按 effectiveProvider + model-id 列表逐项匹配（源码 `reasoning-control.ts` 顶部常量）：

| effectiveProvider | model-id 匹配 | kind | 档位形态 |
|-------------------|--------------|------|---------|
| Claude | `claude-opus-4-(7\|8)`、`claude-opus-5` | `anthropic-adaptive-effort` | low/medium/high（adaptive effort） |
| Claude | `claude-opus-4-5` | `anthropic-effort` | low/medium/high（effort） |
| Claude | `claude-3-7-sonnet`、`claude-sonnet-4`、`claude-haiku-4-5`、`claude-opus-4`(非 4.5/4.7/4.8) | `budget` | low/medium/high（thinking budget） |
| Gemini | `getGoogleThinkingMode()` 为 `budget` | `budget` | thinkingBudget |
| Gemini | `getGoogleThinkingMode()` 为 `level` | `level` | thinkingLevel |
| DeepSeek / OpenAI-compatible 的 DeepSeek V4 | `isDeepSeekReasoningEffortModel()` | `deepseek-effort` | low/medium/high |
| DeepSeek V4 之前的思考模型 | `isDeepSeekReasoningModel()` 且非 V4 | `toggle` | on |
| ChatboxAI 的 DeepSeek V4 | `isDeepSeekReasoningEffortModel()` + 服务端返回的 `apiStyle`（OpenAI Chat / Anthropic / Responses） | `deepseek-effort` | low/medium/high，按 API 风格映射官方参数 |
| ChatboxAI 的 V4 之前 DeepSeek 思考模型 | `isDeepSeekReasoningModel()` 且非 V4；OpenAI Chat / Anthropic | `toggle` | on |
| OpenAI 系（OpenAI / OpenAIResponses / Azure） | `gpt-5*`、`gpt-oss*`（`GPT_EFFORT_MODELS`） | `openai-effort` | low/medium/high |
| Qwen / QwenPortal | `qwen3*`（`QWEN_THINKING_MODELS`） | `budget` | low/medium/high |
| XAI | `grok-4*`（`GROK_REASONING_EFFORT_MODELS`） | `xai-effort` | low/medium/high |
| OpenRouter | `isOpenRouterReasoningModel()`（聚合上述 Claude/GPT/Qwen/Grok/DeepSeek/o 系列） | `openrouter-reasoning` | low/medium/high |

不匹配任何一项 → `DEFAULT_CAPABILITIES`（`supported: false`），控件隐藏、请求侧剥离参数。

> **自定义供应商（`isCustomProviderId`，含 id 任意与字面值 `custom`）在此表之前单独命中**：chat/task 模型一律 `supported: true`，kind 由 `deriveReasoningKind(effectiveProvider, modelId, true)` 推导，不再要求 `capabilities` 含 `reasoning`（见 §1 例外）：
> - **触发顺序在 `getApiStyleDisabledReason` 之前**，因此 API 风格不匹配的 disabledReason 对自定义供应商不生效——模型 id 恰好命中内置家族（`qwen3*` / `grok-4*` / `claude-*`…）也不会被当成交付端点错误而禁用；wire 完全跟随用户给自定义供应商配置的 API 风格。
> - **DeepSeek id 在自定义供应商上固定走 `openai-effort`**（见下），因为 `deepseek` 命名空间仅原生 DeepSeek provider 类消费；自定义的 OpenAI/Claude/Responses 模型类只读 `openaiCompatible`/`claude`/`openai`，若写 `deepseek.reasoningEffort` 会被静默丢弃 → 这正是「调整无生效」的原因之一。Claude → `anthropic-effort`；其余/未知名 → `openai-effort`。

> 这些常量列表（`GPT_EFFORT_MODELS`、`CLAUDE_*`、`QWEN_THINKING_MODELS`、`GROK_REASONING_EFFORT_MODELS` 等）就是「写死的 model id / 前缀」的来源。**新增内置供应商支持思考的模型，在这里加正则即可；自定义供应商无需修改（已全量开放）。**

### DeepSeek 官方协议与档位映射

依据 DeepSeek 官方文档：

- Thinking Mode（开关、强度和不同 API 格式参数）：<https://api-docs.deepseek.com/guides/thinking_mode>
- Anthropic API 兼容性（`thinking` 支持、`budget_tokens` 会被忽略）：<https://api-docs.deepseek.com/guides/anthropic_api>

DeepSeek 官方参数映射如下。**强度参数仅适用于 V4 模型**；更早的 `deepseek-reasoner`、R1、V3.x 等模型只发送 `thinking` 开关，避免服务端拒绝 V4 专属参数：

| API 风格 | 关闭 | 开启与强度 |
|----------|------|------------|
| OpenAI Chat | `thinking: { type: 'disabled' }` | `thinking: { type: 'enabled' }` + `reasoning_effort` |
| Anthropic | `thinking: { type: 'disabled' }` | `thinking: { type: 'enabled' }` + `output_config.effort` |
| Responses | `reasoning: { effort: 'none' }` | `reasoning: { effort }` |

官方强度为 `low / high / max`，同时为兼容其他 Provider 接受 `xhigh`。产品 UI 对 effort 家族（OpenAI / Claude / DeepSeek）提供统一的三档 low/high/max，与官方强度一一对应；旧版本写入的 `medium`/`xhigh` 值仍可读回并继续生效，用户改选时会写入新档位：

| UI 档位 | DeepSeek 官方强度 |
|---------|------------------|
| low | `low` |
| high | `high` |
| max | `max` |

需要注意，官方当前还会按具体模型进一步映射请求强度：`deepseek-v4-flash` 将 `xhigh` 映射为 `high`；`deepseek-v4-pro` 当前将 `low/high` 映射为 `high`、将 `xhigh/max` 映射为 `max`（官方注明计划在 2026 年 8 月上旬更新 V4 Pro 映射）。客户端仍发送明确的 `low/high/max` 意图，最终实际强度以服务端当时的模型映射为准。

ChatboxAI 必须以模型目录中服务端返回的 `apiStyle` 为准，不能假设 DeepSeek 永远使用 Anthropic 风格。V4 当前兼容 `openai`、`anthropic`、`openai-responses` 以及旧缓存中缺失 `apiStyle` 的 OpenAI Chat 兜底；V4 之前的模型继续在 OpenAI Chat / Anthropic 下使用开关控制。

### disabledReason：api style 不匹配

若模型 id 命中某家的思考模型，但当前 effectiveProvider 与之不符（例如把 Claude 思考模型挂在非 anthropic 风格上），`getApiStyleDisabledReason` 返回对应原因，`supported: false`，并在 UI 上提示需要切换到对应 API 风格。

---

## 4. providerOptions 生成（off 的特殊处理）

`getReasoningProviderOptions(provider, model, level, previous)`：

> **off 档已从所有菜单移除（CE 定制）**，但本节的 wire 处理完整保留：旧版本写入的 off 值读回后原样回显并继续走关闭 wire，直到用户改选。

- **若 `!supported`：原样返回 `previous`**（不新增也不清理；清理由请求侧兜底，见 §6）。
- 按 effectiveProvider 写入对应命名空间（`claude` / `openai` / `google` / `deepseek` / `openaiCompatible` / `openrouter`）。
- `level === 'off'` 时各家关闭方式不同，例如：
  - OpenAI 系：`openai.reasoningEffort = 'none' | 'minimal'`（`gpt-5.1/5.2/5.5` 等 `OPENAI_NONE_EFFORT_MODELS` 用合法值 `'none'`，其余用 `'minimal'`）+ `forceReasoning: true`
  - Claude（budget 形态）：`claude.thinking = { type: 'disabled', budgetTokens: 0 }`
  - DeepSeek OpenAI Chat：`deepseek.thinking.type = 'disabled'`
  - DeepSeek Anthropic：`claude.thinking.type = 'disabled'`
  - DeepSeek Responses：`openai.reasoningEffort = 'none'`
  - Gemini：`google.thinkingConfig = { thinkingBudget: 0, includeThoughts: false }`（或 level 形态的 minimal）
  - Qwen：`openaiCompatible.enable_thinking = false`

> 注意 `reasoningEffort: 'none'` 对 `gpt-5.x` 是**合法值**，是有意为之；对不支持思考的模型才是问题（见 §6）。

整个 `ProviderOptions`（`src/shared/types/settings.ts`）schema 的全部命名空间都只承载思考/推理配置，没有非 reasoning 字段。

---

## 5. 持久化与「残留参数」问题

思考设置按 **provider+model 维度**持久化在 `session.settings.providerOptionsByModel`（key 为
`${provider}:${modelId}`，见 `setReasoningProviderOptionsForModel` / `resolveReasoningProviderOptions`）。
每个模型只读取自己名下的选项：切换模型后，另一模型的参数**不会**被继承（读到 `undefined` 即 default 档），
切回原模型时偏好自动恢复。

兼容性：

- 旧的扁平字段 `session.settings.providerOptions` 不再读取（schema 保留仅为兼容旧数据解析），写入时清空。
  思考档位不是重要数据：历史会话升级后从 default 重新开始，旧客户端也读不到新会话的思考设置，均按
  default 处理。

后续规划：

- 思考设置的 UI 入口将从输入框迁移到**模型选择器（model picker）**——在具体模型上提供「编辑思考」按钮，
  按模型直接配置档位。本次将思考档位与 session 内 `provider + modelId` 组合绑定（`providerOptionsByModel`），
  正是为该调整做的数据层准备：每个模型的档位独立存储，picker 上的编辑天然落到对应模型的条目。

历史踩坑路径（per-model map 之前）：

1. 用支持思考的模型（如 `gpt-5.x`）把思考设为 off → 写入 `openai: { reasoningEffort: 'none', forceReasoning: true }`。
2. 同一会话内切换到**不支持思考**的模型（如 `chatbox ai 4`）。
3. 切模型不清理持久化值，且控件对不支持的模型直接隐藏，用户无从在 UI 清掉残留。
4. 若请求构造不做过滤，`reasoning_effort: 'none'` 被发给不支持的模型 → 报错。

> per-model map 从存储层消除了跨模型继承；请求侧兜底（§6 与各 normalize helper）继续保留，
> 覆盖 map 出现之前的历史数据与同步端差异。

---

## 6. 请求侧统一兜底（根治）

在 `AbstractAISDKModel.resolveCallSettings()`（`abstract-ai-sdk.ts`）统一处理，覆盖**所有 provider**：

```ts
const providerId = this.options.model.providerId
const shouldStrip =
  !!providerId &&
  !!options.providerOptions &&
  !getReasoningControlCapabilities(providerId, this.options.model).supported
// shouldStrip 时用 stripReasoningProviderOptions() 剥离全部 reasoning 命名空间
```

要点：

- **判定与 UI 同源**：用 `getReasoningControlCapabilities(providerId, model)`，不用 `isSupportReasoning()`。保证「UI 显示控件 ↔ 保留参数」一致。
- **provider id 来源**：`getModel` → `getModelConfig` 解析模型时盖上 `model.providerId = settings.provider`（`providers/index.ts`），是 registry / custom 两条路径的共用钩子。自建供应商分支还会按 provider type 盖上 `model.apiStyle`，使请求侧能按「api style + model id」判定。
- **保守默认**：`providerId` 未知时**不剥离**，避免误删无法正面分类的参数。
- **剥离实现**：`stripReasoningProviderOptions()` 显式枚举 6 个 reasoning 命名空间（`claude` / `openai` / `google` / `deepseek` / `openaiCompatible` / `openrouter`）并移除；与 `ProviderOptionsSchema` 保持同步。
- `chatStream()` 与 `_callChatCompletion()` 两个生成入口都经由 `resolveCallSettings()`。

---

## 7. 新增 / 调整支持模型的检查清单

1. 在 `reasoning-control.ts` 顶部对应的 model-id 列表 / 正则里增删条目（这是唯一可靠的判定来源，内置供应商用）。
2. 如需新的关闭语义或档位映射，更新 `getReasoningProviderOptions` 中对应 effectiveProvider 分支。
3. 若涉及新的 providerOptions 命名空间，同步更新 `ProviderOptionsSchema` 与 `stripReasoningProviderOptions` 的 `REASONING_PROVIDER_OPTION_KEYS`。
4. 补充 `reasoning-control.test.ts` / `reasoning-request-options.test.ts` 用例。
5. **切勿**改回用 `isSupportReasoning()` / `capabilities` 做支持判定。
6. **自定义供应商**已对 chat/task 模型全量开放思考控制，无需（也无法）按 model id 维护白名单；`ModelEdit` 的 `Reasoning` 能力开关不再影响自定义模型是否显示思考控件。
