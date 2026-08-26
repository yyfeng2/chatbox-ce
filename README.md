<p align="right">
  <a href="README.md">English</a> |
  <a href="./doc/README-CN.md">简体中文</a>
</p>

<h1 align="center">
<img src='./doc/statics/icon.png' width='30'>
<span>
    Chatbox
    <span style="font-size:8px; font-weight: normal;">(Community Edition, Local-First Fork)</span>
</span>
</h1>
<p align="center">
    <em>Your AI Copilot on the Desktop — with **no official ChatGPT/Chatbox backend**.</em><br />
    Chatbox is a desktop client for LLMs, available on Windows, Mac, and Linux.
</p>

<p align="center">
<img alt="macOS" src="https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple&logoColor=white" />
<img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows&logoColor=white" />
<img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" />
<img alt="Privacy" src="https://img.shields.io/badge/-Local%20First-green?style=flat-square&logo=shield&logoColor=white" />
</p>

---

> ## ⚠️ 定制版说明 (Fork Notice)
>
> 本仓库是 **Chatbox 社区版的本地化定制分支（GPLv3）**，相对原版做了以下改动：
>
> - **彻底移除 Chatbox AI 官方服务的一切依赖**（登录 / License / VibeDrop / 官方 Web Search / 知识库远程解析 / 官方默认模型等）
> - **清空全部自带 model provider**，只保留 **自定义 provider (custom)** 体系
> - **纯本地**：应用不再与 `chatboxai.app` 后端交互
>
> 因此，**AI 能力不由本应用提供**。你需要自己提供一个可用的 API（OpenAI-compatible、Anthropic、Ollama 等）并配置为自定义 provider 后才能使用。
> 本项目仅随源码分发，不托管任何聊天服务或官方 AI 代理。

---

This is a fork of the [Chatbox Community Edition](https://github.com/chatboxai/chatbox), open-sourced under the **GPLv3** license.

## Features

### 🤖 AI Provider
-   **Custom Provider (BYO-Backend)**  
    :gear: Bring your own API. Configure any **custom provider** (OpenAI-compatible, Anthropic, Gemini, Ollama, ...) directly in settings — no built-in vendor lock-in.
    -   No bundled model providers; everything is user-configured.

### 🖥️ User Experience
-   **Local Data Storage**  
    :floppy_disk: Your data remains on your device, ensuring it never gets lost and maintains your privacy.

-   **Ergonomic UI & Dark Theme**  
    :new_moon: A user-friendly interface with a night mode option for reduced eye strain during extended use.

-   **Keyboard Shortcuts**  
    :keyboard: Stay productive with shortcuts that speed up your workflow.

-   **Streaming Reply**  
    :arrow_forward: Provide rapid responses to your interactions with immediate, progressive replies.

### 📄 Content & Formatting
-   **Markdown, LaTeX & Code Highlighting**  
    :scroll: Generate messages with the full power of Markdown and LaTeX formatting, coupled with syntax highlighting for various programming languages.

-   **Prompt Library & Message Quoting**  
    :books: Save and organize prompts for reuse, and quote messages for context in discussions.

### 🌐 Platform Availability
-   **Cross-Platform Desktop**  
    :computer: Ready for Windows, Mac, and Linux users.

-   **Web Version**  
    :globe_with_meridians: Use the web application on any device with a browser, anywhere.

### 🌍 Localization
-   English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Русский · Español

### ✨ More Features
-   :sparkles: Constantly enhancing the experience with new features!
-   **Fine-Grained Reasoning Control** :brain: Adjust reasoning effort for capable models across the full scale (`low` / `medium` / `high` / `xhigh` / `max`); custom providers expose it once you enable the model's *Reasoning* capability.
-   **Branch-Aware HTML Export** :books: Export a conversation to HTML with an optional view of every alternative reply branch, switchable directly in the exported file.
-   **Large-Conversation Performance** :rocket: Windowed minimap and linear fork-branch lookups keep long, multi-branch chats responsive while regenerating or switching replies.

## Build from Source

We do not publish pre-built installers here (no official backend / hosting). To use the app, build it from source on your platform.

### Prerequisites

- **Node.js** (v22.x) - [Download here](https://nodejs.org/)
- **pnpm** (v10.x or later) - `corepack enable && corepack prepare pnpm@latest --activate`
- **Git** - [Download here](https://git-scm.com/)

### Build Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yyfeng2/chatbox-ce.git
   cd chatbox-ce
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Run / Build locally**
   ```bash
   pnpm run dev        # development mode with hot-reload
   pnpm run package    # build & package for current platform
   ```

### System Requirements

| Platform | Minimum Version | Architecture |
|----------|----------------|--------------|
| Windows | Windows 10 | x64 |
| macOS | macOS 11 (Big Sur) | Intel/Apple Silicon |
| Linux | Ubuntu 20.04+ / AppImage supported distros | x64 |

## FAQ

-   [Frequently Asked Questions](./doc/FAQ.md)

## Development

### Build Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start development server with hot-reload |
| `pnpm run package` | Build and package for current platform |
| `pnpm run package:all` | Build and package for all platforms |
| `pnpm run build` | Build for production without packaging |
| `pnpm run lint` | Run Biome to check code quality |
| `pnpm run test` | Run Vitest test suite |

### Project Structure

```
chatbox/
├── src/
│   ├── main/               # Electron main process
│   ├── renderer/           # React renderer (UI)
│   ├── preload/            # Electron preload scripts
│   └── shared/             # Shared utilities
├── doc/                    # Documentation and assets
├── resources/              # App resources and icons
└── package.json            # Project configuration
```

## License

[LICENSE](./LICENSE) — GNU General Public License v3.0 (GPLv3)
