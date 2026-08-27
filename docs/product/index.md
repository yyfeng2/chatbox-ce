# Chatbox CE 产品说明

> Last updated: 2026-08

## 产品简介

Chatbox CE（Community Edition）是跨平台 AI 聊天客户端（React + Electron），支持桌面（macOS / Windows / Linux）与网页端。它是**本地化定制分支**：已彻底移除 Chatbox AI 官方服务依赖并清空全部自带 provider，应用**只依赖用户自行配置的 custom provider**，不与应用官方后端交互，也**不发布安装包、不自动更新**（源码分发）。用户可接入任意兼容 OpenAI 风格的自定义模型服务商，管理多轮对话，并通过网页搜索、工具扩展、Agent Skills、代码执行等增强 AI 的能力。

## 核心功能

| 功能 | 说明 | 详情 |
|------|------|------|
| 自定义模型接入 | 通过自定义 provider（Custom）接入任意模型服务商，内置 provider 已清空 | 技术文档 |
| 会话管理 | 多会话并行、线程分支、消息分叉、自动命名 | 技术文档 |
| 网页搜索与工具 | Web Search（Bing / Tavily / BoCha / Querit）、MCP 工具扩展、文件读取 | [工具与集成](./tools-and-integrations.md) |
| Agent Skills | 遵循 agentskills.io 规范的技能系统，支持全局与会话级启用 | [工具与集成](./tools-and-integrations.md) |
| Chat 代码执行 | 在聊天对话中执行代码、解析文档、生成可下载文件（桌面端） | [Chat 代码执行](./code-execution.md) |
| 纯本地 / 隐私 | 所有对话与配置仅存本地，不与应用官方后端交互 | — |

> **注**：原文档链接到 `./ai-models.md`、`./conversations.md`、`./knowledge-base.md`、`./agent-skills.md`、`./cross-platform.md`、`./context-and-tokens.md` 等文件——这些在 `docs/product/` 目录**均不存在**（已删除），此处不再列出。管理端 / 会话 / 上下文等相关说明参见技术文档。

## 目标用户

- **个人用户**：日常使用 AI 助手进行写作、编程、学习、翻译等任务
- **知识工作者**：需要将自有文档与 AI 结合，实现基于文档的问答和分析
- **开发者**：需要灵活接入不同 AI 模型，并通过 MCP 协议扩展 AI 能力
- **团队**：需要在多端使用统一的 AI 工具

## 文档导航

- **本目录**（`docs/product/`）：产品功能说明，面向产品经理、设计师和非技术人员
- **技术文档**（[`docs/technical/`](../technical/index.md)）：系统架构与技术决策，面向工程师
