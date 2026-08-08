# Sentry 错误上报

> Last updated: 2026-07

本文定义 Chatbox Pro 的错误上报边界、分类字段、采样与隐私规则。Sentry 只用于调查产品故障；用户行为与转化漏斗继续使用 JK/Plausible。

## 目标

- 关键错误不漏报：崩溃、React ErrorBoundary、应用/数据库初始化、核心生成链路异常均完整保留。
- 事件可检索：每条事件都有来源、领域、操作、优先级和是否已处理等稳定标签。
- 降低噪音：预期的 API/网络/权限/取消错误不上报，普通且已处理的异常按比例采样。
- 避免重复：主进程同一异常对象在 DB、事务、IPC 多层被捕获时只发送一次。
- 默认匿名：调用方不主动附加提示词、消息或请求参数；发送前清理明确的私密字段和认证凭据。

## 覆盖范围

| 进程 | 错误入口 | 处理方式 |
|------|----------|----------|
| Renderer | SDK 默认全局错误与未处理 Promise | 作为 `critical` 保留，不再重复注册 window 监听 |
| Renderer | React ErrorBoundary | `ui` 领域，按 boundary 名称分类，100% 保留 |
| Renderer | 启动、迁移、会话生成、Agent Mode | 使用 `reportError()` 添加稳定上下文 |
| Renderer | 摘要、命名、token 估算、后台 license 校验 | 仅上报非预期异常，普通错误采样 |
| Main | 未捕获异常、应用启动失败 | `application` 领域，100% 保留 |
| Main | Renderer 进程异常退出 | `renderer-process` 领域，记录 reason 与 exit code |
| Main | Knowledge Base / Session Attachment RAG | 沿用 component/operation 上下文，并统一映射为稳定分类 |

以下情况不应进入 Sentry：

- 用户可理解且已有 UI 反馈的 API、网络、鉴权、额度或模型能力错误；
- Clipboard、App Store 评分提示、远程模型列表等已有 fallback 的辅助功能失败；
- 主动取消产生的 `AbortError`；
- `ResizeObserver` 和跨域 `Script error` 等浏览器噪音；
- `console.error`。本地日志负责保留 console 信息，Sentry 不再劫持 console 或附加 console breadcrumbs。

## 统一标签

| 标签 | 示例 | 含义 |
|------|------|------|
| `error_source` | `renderer` / `main` | 事件来自哪个进程 |
| `error_domain` | `ui`, `storage`, `ai-generation`, `knowledge-base` | 失败所属产品/技术领域 |
| `error_operation` | `migration`, `submit_message`, `database_initialization` | 失败时正在执行的稳定操作名 |
| `error_priority` | `critical`, `high`, `normal` | 决定保留与采样策略 |
| `error_handled` | `true` / `false` | 应用是否捕获并继续运行 |
| `error_sample_rate` | `1`, `0.1`, `0.2` | 当前事件使用的采样率，便于解释数量 |

原有的 `component`、`operation`、`platform`、`app_version`、`build_target`、`build_platform` 继续保留，兼容历史查询。

## 优先级与采样

| 优先级 | 典型事件 | Renderer | Main |
|--------|----------|----------|------|
| `critical` | 未处理错误、ErrorBoundary、进程退出、应用启动失败 | 100% | 100% |
| `high` | 数据迁移、数据库/向量库初始化、核心生成、Agent Mode | 100% | 100% |
| `normal` | 已处理且有 fallback 的非预期异常 | 10% | 20% |

采样只影响发送，不改变本地日志。主进程还会按异常对象去重，因此同一错误在底层和上层被重复捕获时不会重复计数。

## 上报规范

Renderer 新增显式上报时使用 `src/renderer/utils/sentry.ts`：

```ts
reportError(error, {
  domain: 'session',
  operation: 'submit_message',
  priority: 'high',
})
```

调用前先判断错误是否为预期业务结果。只有调查故障所需的低基数字段才放 tag；数量、耗时、状态码等放 extra。不要附加原始消息、prompt、请求体、响应体、文件名、文件路径、查询文本、认证信息或用户标识。

生成链路统一使用 `src/shared/models/error-classification.ts` 判断预期错误，覆盖 Chatbox AI 额度/License/能力错误、Provider API 错误、网络错误和已有 fallback 的 OCR/图片能力错误。不要在各入口维护不同的错误白名单。

Main/Shared 通过 `SentryAdapter.withScope()` 设置相同标签。Knowledge Base 与 RAG 的既有 `component` / `operation` 会由统一策略自动映射。

## 隐私保护

发送前统一执行以下处理：

- 清除 `event.user` 和 request body；
- 数据迁移先于 Sentry、JK 和 Plausible 初始化，确保跨存储升级时使用迁移后的 consent；
- 迁移失败保留原始异常与堆栈，并附带失败的 `configVersion` 和目标版本；
- 设置关闭后立即停止发送；重新开启后无需重启应用即可恢复 Renderer 与 Main 上报；
- 删除名称明确表示凭据的请求头，例如 Authorization、Cookie、各类 API Key 和认证 Token；
- 移除 URL query 与 fragment；
- 递归清理 context、extra 和 breadcrumb 中名称明确的私密字段，例如 path、filename、query、prompt、messages、options，以及 password、secret、API Key、license key 和认证 Token；
- 字段名按 camelCase、snake_case 和 header-case 规范化后做精确名称或凭据后缀匹配，不使用宽泛子串匹配；
- 其他字段默认保留，包括 `tokenCount`、`maxTokens`、`contentLength`、`queryDuration`、`promptVersion` 等诊断信息；
- 对异常文本、stack frame 和 breadcrumb 中的 Bearer token、`sk-` key、macOS/Linux/Windows 用户主目录进行脱敏；
- Renderer 不上传 console breadcrumbs。

Main 的 fatal handler 在未捕获异常时等待 Sentry flush（最多 2 秒）后以失败状态退出，避免关键崩溃事件只进入异步队列便被进程终止。

## Sentry 查询建议

- 关键故障：`error_priority:critical`
- 按进程：`error_source:main` 或 `error_source:renderer`
- 按领域：`error_domain:knowledge-base`
- 按操作：`error_operation:database_initialization`
- 新版本回归：叠加 `release:<version>`、`environment:production`

观察事件量时需结合 `error_sample_rate`，普通错误的原始发生次数不能直接用发送数代替。
