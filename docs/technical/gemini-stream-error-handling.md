> **⚠️ 本定制版声明**
>
> 此文档描述**原始 Chatbox 项目**的功能设计。本仓库为本地化定制分支，已**彻底移除 Chatbox AI 官方服务依赖并清空全部自带 provider**，因此本文档中涉及 ChatboxAI 官方后端、自带供应商及已删除功能（VibeDrop / chatbox-cli / 官方 Web Search / 远程知识库解析等）的部分**不再适用**，仅作历史参考。具体差异请参阅 [README](../README.md) 的定制版说明。

---

# Gemini 流式错误拦截与重试安全

> Last updated: 2026-08

## 背景

后端网关优雅关闭(graceful shutdown)时,会在 HTTP 200 的 SSE 流中写入协议内错误帧:

```
data: {"error":{"code":503,"message":"The server was restarted during this response. Please retry to continue.","status":"UNAVAILABLE"}}
```

`@ai-sdk/google` 的 `chunkSchema` 没有 `error` 字段,Zod 会把未知字段剥离成 `{}` 并静默跳过该 chunk——用户只看到被截断的回复,没有任何错误提示或重试入口。这是 SDK 的**未文档化实现细节**,不是公开契约。

相关后端改动见 chatbox-backend 仓库 PR 548(网关在 200 OK 之后写入 schema-breaking 错误事件)。

## 机制

```
ChatboxAI Google 网关响应
        ↓ chatboxAIFetch (chatboxai.ts)
  maybeWrapGeminiErrorResponse        ← 仅 URL 含 :streamGenerateContent 时包裹
        ↓ TransformStream (gemini-stream-error.ts)
  按 SSE 帧边界(LF/CRLF)切分,完整帧原样转发
        ↓ 检测到 {"error":...} 帧
  内容已转发 → 抛 MidStreamApiError(不自动重试)
  内容未转发 → 抛 ApiError(允许 ai-retry 自动重试)
```

核心文件:

| 文件 | 职责 |
|------|------|
| `src/shared/models/utils/gemini-stream-error.ts` | SSE 帧解析、错误帧检测、包裹判定(`:streamGenerateContent` + content-type) |
| `src/shared/models/errors.ts` | `MidStreamApiError extends ApiError`:部分输出后的失败,禁止自动重试 |
| `src/shared/models/abstract-ai-sdk.ts` | `isRetryableStatusError` 对 `MidStreamApiError` 返回 false;`handleError` 解包 ai-retry 的 `RetryError`、用 `extractStreamErrorMessage` 提取可读消息 |
| `src/shared/models/utils/stream-error-message.ts` | 从各种错误对象形状提取可读消息,避免 `[object Object]` |

## 重试安全分类(billing safety)

自动重试的前提(PR 741 确立):5xx/429 发生在服务端开始生成之前,重试不会重复计费。mid-stream 错误恰好违反该前提——内容已流出,可能已计费,且静默重试的新输出会追加在已渲染的旧文本后造成重复。

因此错误分两类,由 wrapper 依据 `forwardedContent`(是否已转发过含 `data:` 行的帧;注释/keepalive 帧不计)决定:

- **`ApiError`(内容前)**:进入 `isRetryableStatusError` → ai-retry 静默重试,用户无感。
- **`MidStreamApiError`(内容后)**:不自动重试,错误连同已流出的部分文本一起展示,用户手动重试。

错误从 `transform()` 抛出后成为 stream 的 hard rejection,按引用穿过 `@ai-sdk/google` 的 pipe 链与 ai-retry 的 reader,`instanceof` 身份保持不变(已实证验证)。

## 范围决策

**仅 ChatboxAI 网关**:错误帧由我们自己的后端优雅关闭协调产生。直连 Gemini provider(`gemini.ts` / `custom-gemini.ts`)不经过 `chatboxAIFetch`,暂不包裹;若确认 Google 官方 API 也会发送同形状 mid-stream 错误帧,可将 wrapper 接入它们的 fetch。

## 维护清单(依赖升级时)

- **升级 `@ai-sdk/google`**:确认 chunkSchema 是否仍然静默剥离 `error` 字段。若上游开始自行 surface mid-stream 错误,本 wrapper 可整体移除。
- **升级 `ai-retry`**:`handleError` 的解包依赖 `RetryError.lastError` 持有原始抛出错误;stream 错误路径依赖其 reader `catch` 不受 `isStreaming` 门控。
- **后端网关路由变更**:wrapper 的 URL 判定只依赖 Google REST 动词 `:streamGenerateContent`,不含网关路径,网关改路径不影响检测。
