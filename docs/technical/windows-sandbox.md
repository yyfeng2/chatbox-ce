# Windows 原生代码执行

> Last updated: 2026-07
>
> 状态：**已实现最小原生支持（放弃文件隔离）**。本文记录 Windows 上代码执行的根因分析、
> 方案对比，以及当前落地方案与未来的强隔离演进方向。
>
> **当前决定（本次实现）**：Windows 作为原生应用，代码执行**原生直跑、无操作系统沙箱**
> （放弃文件/网络隔离），换取无管理员、无注销重登的良好本地体验。强隔离（SRT-Windows /
> Codex unelevated）记录在 §3.2 / §3.3 作为后续演进，本次不做。

## 1. 问题背景

Chatbox 的 Agent Mode 代码执行（见 [Chat 代码执行](./code-execution.md)）在 macOS/Linux 上
通过 `@anthropic-ai/sandbox-runtime`（下称 **SRT**）实现隔离，但在 **Windows 上完全不可用**：

```
Sandbox init failed: Sandbox dependencies not available: Unsupported platform
```

### 根因

- 我们当时锁定的是 SRT `0.0.34`（2026-02）。该版本 `isSupportedPlatform()` 只认 `macos` /
  `linux`；在原生 Windows 进程（`process.platform === 'win32'`）调用 `initialize()` /
  `wrapWithSandbox()` 会直接抛 `Unsupported platform`。
- SRT 的设计是**自身作为 Linux 进程运行**（在 WSL2 里 `process.platform` 即为 `linux`）。
  Chatbox 的 Electron 主进程在 Windows 上是**原生 win32 进程**，从未真正"进入 WSL 跑 runtime"。
- 历史代码里的 `toWSLPath()`、`checkAvailability()` 查 `wsl --status` 是**半成品**：只转换了
  路径、探测了 WSL，却仍在 win32 进程内调用 runtime，必然失败。
- PR #813 基于"Windows 走 WSL"这一**错误前提**做了命令构造层适配（`command node` in WSL、
  `toSandboxShellPath` 等）。这些 Windows 专属改动在本方案下作废，需清理（见 §7）。

## 2. 调研：现有可选方案

### 2.1 升级 SRT 到 0.0.55（Windows 后端已存在）

SRT 自 **`0.0.53`（2026-06-04）** 起新增原生 Windows 支持，`0.0.55` 为最新：

- `isSupportedPlatform()` 现返回 `macos || windows`。
- 网络隔离：**Windows Filtering Platform (WFP)** 过滤器 + http/socks 代理。
- 进程/文件隔离：在一个 **deny-only discriminator group** 下用受限令牌跑子进程。
- 执行入口改为 `wrapWithSandboxArgv()` 返回 `{argv, env}`，以 `{shell:false}` 启动
  （Windows 上 `wrapWithSandbox()` 会抛错，强制走 argv 形式）。
- 依赖一个 Rust helper `srt-win.exe`：**npm 包只含源码，无预编译二进制**；官方平台包
  `@anthropic-ai/sandbox-runtime-win32-*` 目前 404 未发布。

**致命的 UX 问题**：WFP 过滤器只在 discriminator group **进入调用者 token** 后才生效，而这
需要一次**注销 / 重新登录**（"the logout/login dance"，源码注释原话）。在此之前 WFP filter-0
放行所有流量，即网络未隔离。首次启用还需**管理员权限**创建组 + 安装 WFP 过滤器。
对消费级桌面应用，"装完要注销重登"是不可接受的门槛。

### 2.2 Codex 原生 Windows 沙箱（最终参考）

OpenAI Codex（**Apache-2.0**，`openai/codex` → `codex-rs/windows-sandbox-rs`）已落地、文档化，
原生 Windows、不依赖 WSL，提供两种模式：

| | `elevated`（强） | `unelevated`（无需管理员） |
|---|---|---|
| 文件系统 | 专用低权限 **sandbox 本地用户** + ACL 边界 | **从当前用户派生的受限令牌** + ACL 边界 |
| 网络 | **防火墙规则**（offline-user firewall） | **环境变量级 offline 控制** |
| 管理员 | 需要（UAC：建用户/组、防火墙、登录权限） | **不需要** |
| 注销/重登 | 否 | **否** |
| UI 隔离 | 默认 private desktop | 默认 private desktop |
| 终端 | ConPTY（Win10 1809+，Win11 推荐） | 同左 |

分发的二进制（`@openai/codex@…-win32-x64` 包内已预编译）：

- `codex-windows-sandbox-setup.exe` — 一次性 setup（manifest 为 `asInvoker`，按需提权）。
- `codex-command-runner.exe` — 每条命令的 runner：派生受限令牌，ConPTY/管道 spawn，IPC 帧通信。

源码模块映射：`token.rs`/`cap.rs`（受限令牌）、`acl.rs`/`workspace_acl.rs`/`deny_read_acl.rs`
（FS ACL）、`identity.rs`/`hide_users.rs`（sandbox 用户）、`wfp.rs`（防火墙）、`desktop.rs`
（private desktop）、`conpty/`（终端）、`setup.rs`/`elevated_impl.rs`（提权 setup）。

### 2.3 其他（已排除）

- **Windows Sandbox / AppContainer**：前者需 VM 桥接、Home 版不全量可用、不便操作用户工作目录；
  后者对任意 shell/dev 工具兼容性差，OpenAI 也明确不适合开放式 agent 工作流。
- **Docker / WSL2**：不符合"原生 Windows、不依赖 WSL"目标。
- **社区 fork**（`@vscode/sandbox-runtime`、`opencode-sandbox`、`@xmz-ai/sandbox-runtime`）：
  均为 macOS/Linux 路线的包装层，不含 Windows helper，不解决核心问题。

## 3. 选型与当前实现

### 3.1 当前决定：最小原生支持，放弃文件隔离

考虑到强隔离方案改动巨大，本次**先让 Windows 能原生执行代码**，放弃文件/网络隔离：

- **升级 SRT**：`0.0.34` → `0.0.54`（受 pnpm `minimumReleaseAge: 10080`=7 天约束，0.0.55 仅 2 天被拦；
  0.0.54 通过且已含 Windows 后端，为未来留门）。此升级**只惠及 macOS/Linux**，已在 macOS 实测无回归。
- **Windows 原生执行（无沙箱）**：`code_execution` 在会话工作目录里直接跑：
  - `node`：用打包的 Electron 二进制 + `ELECTRON_RUN_AS_NODE`，程序经 **stdin** 喂入（无需 shell 转义/路径转换）。
  - `powershell`：优先使用 `CHATBOX_POWERSHELL_PATH` 指定的程序或 PowerShell 7（`pwsh.exe`），再回退到
    Windows 自带的 `powershell.exe`。使用 `-NoLogo -NoProfile -NonInteractive -Command -` 从 stdin 执行，
    原生继承 `spawn({ cwd })` 的 Windows 工作目录和路径语义。
  - `bash`：优先使用 `CHATBOX_GIT_BASH_PATH` 指定的 Git Bash，然后检查 Git for Windows、
    PortableGit / Scoop 等常见位置和 `git.exe` 旁的 `bash.exe`；再兼容 PATH 上的其他 POSIX shell，
    最后才回退到 `wsl bash`。解析结果显式区分 `git-bash` / `path-bash` / `wsl`，脚本均经 stdin
    喂入。无 bash 时返回清晰错误。
  - 工作目录通过 `spawn({ cwd })` 传入，不要求模型先执行 `cd` / `Set-Location`。Windows 上优先提示模型
    使用 PowerShell 执行终端命令和原生路径操作；Bash 只用于 POSIX 专属脚本。工作目录内部优先使用相对路径，
    工作目录外（包括用户授权的真实目录）使用绝对路径和结构化文件工具。Bash 提示会区分 Git Bash 的
    `C:/...` 与 WSL 的 `/mnt/c/...`，并禁止直接传入 `C:\\...`。若模型仍用原生路径执行 `cd`，shim 会通过
    `cygpath` / `wslpath` 做窄范围兜底。
  - 核心文件工具不经过 Bash：分页读取和单目录列表使用 Node helper，递归发现和内容搜索使用内置
    ripgrep，本地产物下载直接调用持久化接口。未安装 Git Bash/WSL 不影响 `read_file`、`list_files`、
    `search_files` 或 `create_download`。
- **`checkAvailability(win32)` → available**（原生、无隔离），移除旧的 `wsl --status` 探测。
- **不做** env 级网络关闭（容易绕过，价值低）。
- **支持绑定真实工作目录**：Agent Mode 的工作目录入口在 Windows 上可用。文件工具会把原生
  `C:\...`、WSL `/mnt/c/...`、Git Bash `/c/...` 和 Cygwin `/cygdrive/c/...` 路径统一成原生路径，
  并用不区分大小写、按路径段匹配的方式判断是否位于用户授权目录中。
- **绑定目录的写入边界**：`write_file` / `edit_file` 对授权目录内的路径免二次审批，但实际写入仍经
  主进程按会话保存的授权根目录校验；授权时会固定目录的 canonical target，根目录、相邻前缀、`..`
  越界、授权后被替换的根目录以及指向目录外的 symlink/junction 不会获得免审批写入。绑定目录内任意
  层级的 `.env`、`.env.local`、`.env.production` 仍保持拒写。

**安全取舍（须知）**：Windows 上 `code_execution` 运行模型生成的任意代码，以**当前用户完整权限**执行——
可读 `~/.ssh`、删改用户文件、自由联网。相对 macOS（Seatbelt）/ Linux（bubblewrap）的
denyRead/allowWrite 是**实质降级**。UI/文档须如实标注，并保持在显式开启入口之后。绑定工作目录只表示
用户授予文件工具在该目录内免二次审批，**不是 Windows OS 沙箱**；`write_file` / `edit_file` 对临时目录、
绑定目录以外绝对路径的用户批准提示仍然有效（工具层，与 OS 沙箱无关）。

### 3.2 未来强隔离选项 A：SRT-Windows 后端

升级到的 SRT 0.0.53+ 自带 Windows 后端（WFP + deny-only 组），但首装需**管理员 + 注销/重登**，
并要自行编译/签名/分发 `srt-win.exe`。UX 门槛高，暂不采用。

### 3.3 未来强隔离选项 B：Codex unelevated 模型（推荐演进方向）

Codex（Apache-2.0）的 `unelevated` 模型——从当前用户派生**受限令牌** + 对工作目录/敏感路径做
**ACL 边界** + 环境级网络 offline——是唯一同时满足"无需管理员、无需注销重登、且有真实文件系统隔离"
的方案。是后续把"放弃文件隔离"补回强隔离的推荐方向。下文 §4 起的架构设计即针对该方向，作为未来实现参考。

## 4. 未来强隔离架构设计（Codex unelevated，参考，未实现）

在 `src/main/sandbox/` 现有 `SandboxProvider` / `SandboxManager` 抽象下，新增 Windows 原生后端，
与现有 macOS/Linux（SRT）后端并存：

```
execCommand(command)
  ├─ darwin/linux → SRT wrapWithSandbox → spawn({shell:true})   （现状不变）
  └─ win32        → WindowsSandbox.wrapArgv → spawn(helper, {shell:false})
```

### 4.1 受限令牌（核心）

- 复制当前用户 token → 用 `CreateRestrictedToken` 施加：
  - `DISABLE_MAX_PRIVILEGE`（剥离特权）；
  - 把高权限组标记为 **deny-only**（USE_FOR_DENY_ONLY），尤其 Administrators；
  - 可选 lowered integrity level（`SetTokenInformation` / `TokenIntegrityLevel`）。
- 子进程以该受限令牌 `CreateProcessAsUser` 启动；继承 stdio（pipes）或 ConPTY（tty）。

### 4.2 文件系统边界（ACL）

- **工作目录**：对沙箱工作目录授予受限令牌可写（与现有 `workingDirectory` 模型一致）。
- **denyRead**：对 `TASK_SANDBOX_DENY_READ_PATHS`（`~/.ssh`、`~/.aws` 等）施加 deny-read ACE，
  并对 reparse-point 的 canonical target 一并施加（参考 Codex `deny_read_acl.rs`，防符号链接绕过）。
- **denyWrite**：`.env` 等保持拒写。
- 工作目录外默认不可写：受限令牌 + 父目录 ACL 共同约束（用户目录对 deny-only 组不授写）。

### 4.3 网络（unelevated 的 env-offline）

- 不装 WFP/防火墙（那是 elevated + admin 的范畴）。
- 通过环境变量 + 不提供代理凭据的方式让子进程默认离线（参考 Codex `env.rs`）。明确这是**弱网络隔离**，
  能阻断遵守 proxy 约定的工具，但不是内核级强制。文档与 UI 需如实标注。

### 4.4 终端

- `tty=true` 走 **ConPTY**（Win10 1809+）；`tty=false` 走 pipes。复用现有 stdout/stderr 截断与
  10MB 缓冲、超时 → `taskkill /T /F`（#813 已落地的 `killProcessTree`）。

### 4.5 helper 二进制

两条路线（§8 决策）：

- **A. Vendor Codex 的 helper**：Codex 为 Apache-2.0，可在遵守许可证（保留 NOTICE）的前提下
  vendor `codex-command-runner.exe`（unelevated 路径）。最快，但引入对 Codex CLI 内部 IPC 协议
  的依赖，升级/裁剪成本不可控，且二进制入仓 + 签名负担。
- **B. 自研最小 helper**：按 Codex unelevated 设计自写一个小 Rust（或 C++）helper：
  `CreateRestrictedToken` + ACL + `CreateProcessAsUser` + ConPTY 桥接。可控、可裁剪、与 Chatbox
  IPC 对齐，但工作量大、需 Windows 构建链与代码签名。

无论 A/B，都通过 electron-builder `app.asar.unpacked` 分发 helper，运行时按
`SRT_WIN_PATH` 式的解析定位。

## 5. 能力探测与降级

- `checkAvailability()` 的 win32 分支**移除 `wsl --status`**，改为：探测 helper 存在 + ConPTY 可用
  （Win 版本 ≥ 10 1809）。不可用时干净禁用代码执行工具（不构建、不崩、UI 标注原因）。
- Windows 上隔离能力如实声明：**FS 隔离 = 受限令牌 + ACL（真实）**；**网络隔离 = env-offline（弱）**。
  不夸大为"完整 denyRead/allowWrite + 强网络隔离"。

## 6. 安全说明

- `unelevated` 的边界强度 < macOS Seatbelt / Linux bubblewrap。受限令牌 + ACL 能挡住"误删用户文件 /
  读取敏感目录 / 越权写"，但 deny-only 组对持有同用户其他句柄的高级绕过不是铁壁。
- 如需与桌面其他平台同等强度，提供可选 `elevated` 模式（管理员一次性 setup），或把强隔离任务
  下放到远端/容器/microVM sandbox。

> 注：§4–§6（受限令牌 / ACL / WFP / 提权 setup / 能力探测的强隔离版本）描述的是 §3.3 未来
> Codex unelevated 方向的设计，**本次未实现**，保留作参考。

## 7. 已清理 PR #813 的 WSL 遗留（本次完成）

PR #813（已合并，commit `c955cbf94`）基于错误的 WSL 前提。本次已清理其 Windows 专属部分：

- 已移除：`sandbox:node-command` 的 `command node`（WSL）分支、`toSandboxShellPath()`/`toWSLPath()`
  及其在 env 改写与 `readFile`/`listDir`/`grepFiles`/`findFiles` 中的调用、`checkAvailability()` 的
  `wsl --status` 分支。
- 保留：`killProcessTree()`（`taskkill /T /F`，原生 Windows 仍需要）、`detached` 仅 POSIX 启用。

## 8. 本次实现清单

- `release/app/package.json`：SRT `^0.0.34` → `^0.0.54`。
- `manager.ts`：win32 `initSandbox` 跳过 SRT；新增 `execCode`（node 经 execPath+ELECTRON_RUN_AS_NODE、
  PowerShell 经 `resolveWindowsPowerShell()`、bash 经 `resolveWindowsBash()`，均经 stdin 喂入）；PowerShell 7
  优先并回退 Windows PowerShell，Git Bash 优先并显式区分 PATH Bash / WSL；
  `checkAvailability(win32)` 返回 available；清理 WSL 遗留。
- `ipc-handlers.ts`：`sandbox:exec-code` 成为全平台唯一代码执行入口，移除 `sandbox:exec` 与
  `sandbox:node-command`。
- `interfaces.ts` / `desktop_platform.ts`：桌面端统一使用 `sandboxExecCode`。
- `local-provider.ts`：`exec()` 在所有桌面平台路由到 `sandboxExecCode`；Windows bash 保留其 PATH 中的
  `node`，避免 WSL 执行宿主 Electron 路径。
- `AgentModePanel.tsx`：Windows 开放绑定工作目录入口。
- `windows-path.ts` / `filesystem.ts`：统一 Windows 原生与 shell 路径、大小写无关边界判断，并把授权目录
  的文件工具写入路由到主进程。
- `manager.ts`：会话记录经过筛选的授权目录；写入/编辑执行词法边界与 canonical symlink/junction 校验。
- `manager.ts` / `ripgrep-search.ts`：文件分页读取和单目录列表使用 Node helper；文件发现与内容搜索统一走
  内置 ripgrep；相对下载路径基于会话工作目录解析并校验允许根目录，不再依赖 Bash `realpath`。
- `code-execution.ts`：本地 `create_download` 直接调用 `persistArtifact`，Windows 输出固定保存在工作目录。
- 测试：`resolveWindowsPowerShell` / `resolveWindowsBash` 决策、Windows 路径别名/大小写/越界、授权目录
  symlink 逃逸、无 Bash 文件工具与大输出分页单测；macOS SRT 路径与 stdin 执行机制已实测。

## 9. 验证状态与后续

- ✅ macOS：SRT 0.0.54 升级实测无回归（init/wrap/exec 跑通）；40+ sandbox 单测通过。
- ✅ 机制：node（无参 + stdin）、PowerShell（stdin）与 bash（stdin）执行均有聚焦测试覆盖。
- ✅ Windows：GitHub Actions `windows-2022` 已覆盖原生 Node/PowerShell/Bash stdin 执行、PowerShell 7
  / Windows PowerShell 解析、Git Bash 解析、原生 `C:\\...` 路径、空格/中文目录、文件读写/搜索以及
  shell 路径回转，并在 PR #901 验证无 Bash 文件读取/列表、内置 ripgrep 查找与相对路径产物持久化；WSL 仍只做决策单测，
  未在 hosted runner 上安装发行版做端到端验证。
- 后续（如需补回隔离）：按 §3.3 / §4 的 Codex unelevated 方向实现受限令牌 + ACL。
