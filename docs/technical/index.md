# Chatbox CE 技术设计文档

> Last updated: 2026-08

本目录包含 Chatbox 社区版（CE 定制版）的系统设计与技术文档，面向工程师和技术负责人。

如需了解产品功能概述（面向非技术人员），请参阅 [`docs/product/`](../product/index.md)。

> 说明：本 fork 已移除 Chatbox AI 官方服务与全部内置 model provider，仅保留自定义 provider（custom）体系。因此
> 对官方 Chatbox 的 OAuth/内置供应商/官方后端相关的设计文档已不再维护，此处仅收录与当前定制版代码一致的技术文档。

## 文档目录

| 文档 | 描述 |
|------|------|
| [AI 供应商系统](./ai-providers.md) | 模型供应商注册表（registry / custom 体系）、OAuth 登录集成、模型类层级、自建供应商 |
| [思考控制（Reasoning Control）](./reasoning-control.md) | 思考控制支持条件判定（provider + 写死 model id）、effectiveProvider/apiStyle 映射、参数流转与请求侧兜底（含自定义模型全档位开放） |
| [Gemini 工具调用 Thought Signatures](./gemini-tool-call-thought-signatures.md) | Gemini 3 function calling 的 signature 规则、并行工具调用历史序列化、25 次暂停继续问题复盘 |
| [Gemini 流式错误拦截与重试安全](./gemini-stream-error-handling.md) | mid-stream 错误帧检测、MidStreamApiError 重试安全分类、网关范围决策与依赖升级维护清单 |
| [会话管理系统](./session-management.md) | 数据模型、模块拆分、新会话机制、线程历史、消息分叉 |
| [存储架构](./storage.md) | 混合存储策略、跨平台方案、版本迁移历史 |
| [数据备份归档](./data-backup.md) | ZIP v2 格式、资源范围、流式导入导出、事务恢复与安全限制 |
| [Session Attachment RAG 评测](./session-attachment-rag-eval.md) | 大文件问答 RAG 的模型工具调用评测、真实流程与 fixture 策略 |
| [工具与集成系统](./tools-and-integrations.md) | MCP 服务器、Web 搜索、内置工具集、Tool 构建 |
| [Agent Skills 技术设计](./agent-skills.md) | Skills 发现/解析、IPC 通道、上下文注入与会话级配置 |
| [Chat 代码执行](./code-execution.md) | Agent Mode、Code Execution 工具集、SandboxProvider 抽象、会话隔离 |
| [Windows 原生代码执行](./windows-sandbox.md) | Windows 代码执行根因分析、SRT/Codex 方案对比、当前最小原生支持（放弃隔离）与未来强隔离演进 |
| [构建与部署](./build-and-deployment.md) | 构建工具链、依赖管理、签名打包、CI/CD |
| [自动更新系统](./auto-updater.md) | electron-updater 机制、状态管理、Feed URL Fallback、本地测试方法（CE 定制版：只检查不自动安装） |
| [Sentry 错误上报](./sentry-error-reporting.md) | 错误覆盖范围、统一分类、采样降噪、去重与隐私规则 |

> 注：`Token 估算系统`、`上下文管理系统`、`知识库（RAG）` 等pro 仓库遗留文档在本 fork 中已不在 `docs/technical/`，
> 详见 [`docs/token-estimation.md`](../token-estimation.md)（仍在 docs/ 根目录）。

## 文档定位

- **本目录**（`docs/technical/`）：**怎样**设计的？技术架构与决策记录
- **产品文档**（`docs/product/`）：**做什么**？产品功能说明，面向非技术人员
- **实现文档**（`docs/`）：**怎样**实现的？开发指南和代码规范
- **AGENTS.md**：开发工作流和快速命令

## 如何维护

每个文档都包含 `Last updated: YYYY-MM` 标记。当系统设计发生变化时：

1. 更新相关文档内容
2. 更新该文档的 `Last updated` 时间戳
3. 如果涉及多个文档，同时更新所有相关文件
4. 提交 commit 时说明变更原因
