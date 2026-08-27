<p align="right">
  <a href="../README.md">English</a> |
  <a href="README-CN.md">简体中文</a>
</p>

<h1 align="center">
<img src='./statics/icon.png' width='30'>
<span>
    Chatbox
    <span style="font-size:8px; font-weight: normal;">(Community Edition, 本地化定制版)</span>
</span>
</h1>
<p align="center">
    <em>桌面 AI 助手 —— **不依赖任何官方 ChatGPT/Chatbox 后端**。<br />基于 Chatbox 社区版的本地客户端，支持 Windows、Mac、Linux。</em>
</p>

<p align="center">
<img alt="macOS" src="https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple&logoColor=white" />
<img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows&logoColor=white" />
<img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" />
<img alt="Privacy" src="https://img.shields.io/badge/-Local%20First-green?style=flat-square&logo=shield&logoColor=white" />
</p>

---

> ## ⚠️ 定制版说明
>
> 本仓库是 **Chatbox 社区版的本地化定制分支（GPLv3）**，相对原版做了以下改动：
>
> - **彻底移除 Chatbox AI 官方服务的一切依赖**（登录 / License / VibeDrop / 官方 Web Search / 知识库远程解析 / 官方默认模型等）
> - **清空全部自带 model provider**，只保留 **自定义 provider (custom)** 体系
> - **纯本地**：应用不再与 `chatboxai.app` 后端交互
>
> 因此，**AI 能力不由本应用提供**。你需要自己提供一个可用的 API（OpenAI-compatible、Anthropic、Ollama 等），配置为自定义 provider 后即可使用。
> 本项目仅随源码分发，不托管任何聊天服务或官方 AI 代理。

---

本项目是 [Chatbox 社区版](https://github.com/chatboxai/chatbox) 的分支，以 **GPLv3** 许可证开源。

## 特性

### 🤖 AI 提供商
-   **自定义 Provider（自带后端 BYO）**  
    :gear: 自带 API，在设置中直接配置任意 **自定义 provider**（OpenAI-compatible、Anthropic、Gemini、Ollama 等）——不绑定任何内置厂商。
    -   无内置模型提供商，全部由用户自行配置。

### 🖥️ 用户体验
-   **本地数据存储**  
    :floppy_disk: 数据保存在您的设备上，确保数据永不丢失并保护您的隐私。

-   **人体工程学 UI 与深色主题**  
    :new_moon: 用户友好的界面，带夜间模式以减轻长时间使用的疲劳。

-   **键盘快捷键**  
    :keyboard: 使用快捷键提高工作效率。

-   **流式回复**  
    :arrow_forward: 通过即时、渐进式回复快速响应您的互动。

### 📄 内容与排版
-   **Markdown、LaTeX 与代码高亮**  
    :scroll: 使用 Markdown 与 LaTeX 的全部功能，配合多种编程语言的语法高亮。

-   **提示库与消息引用**  
    :books: 保存和组织提示以供复用，并在讨论中引用消息提供上下文。

### 🌐 平台支持
-   **跨平台桌面端**  
    :computer: 已为 Windows、Mac、Linux 用户准备就绪。

-   **Web 版本**  
    :globe_with_meridians: 在任何带浏览器的设备上使用 Web 应用。

### 🌍 多语言
-   English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Русский · Español

### ✨ 更多特性
-   :sparkles: 持续增强体验，加入新功能！

## 从源码构建

本项目不发布预编译安装包（不依赖官方后端 / 不托管服务）。要使用该应用，请在对应平台从源码自行构建。

### 环境要求

- **Node.js** (v22.x) - [下载](https://nodejs.org/)
- **pnpm** (v10.x 或更高) - `corepack enable && corepack prepare pnpm@latest --activate`
- **Git** - [下载](https://git-scm.com/)

### 构建步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/yyfeng2/chatbox-ce.git
   cd chatbox-ce
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **本地运行 / 打包**
   ```bash
   pnpm run dev        # 开发模式（热更新）
   pnpm run package    # 为当前平台构建并打包
   ```

### 系统要求

| 平台 | 最低版本 | 架构 |
|----------|----------------|--------------|
| Windows | Windows 10 | x64 |
| macOS | macOS 11 (Big Sur) | Intel / Apple Silicon |
| Linux | Ubuntu 20.04+ / 支持 AppImage 的发行版 | x64 |

## 开发

### 构建命令

| 命令 | 说明 |
|---------|-------------|
| `pnpm run dev` | 启动开发服务器（热更新） |
| `pnpm run package` | 为当前平台构建并打包 |
| `pnpm run package:all` | 为所有平台构建并打包 |
| `pnpm run build` | 生产构建（不打包） |
| `pnpm run lint` | 运行 Biome 检查代码质量 |
| `pnpm run test` | 运行 Vitest 测试 |

### 项目结构

```
chatbox/
├── src/
│   ├── main/               # Electron 主进程
│   ├── renderer/           # React 渲染进程（UI）
│   ├── preload/            # Electron preload 脚本
│   └── shared/             # 共享工具
├── doc/                    # 文档与静态资源
├── resources/              # 应用资源与图标
└── package.json            # 项目配置
```

## License

[LICENSE](../LICENSE) — GNU General Public License v3.0 (GPLv3)
