<!-- README_SYNC: source=working-tree-v0.3.4; updated=2026-10-25 -->
<p align="center">简体中文 · <a href="./README_EN.md">English</a></p>

# Codex Synapse · 会话画布

面向 Windows Codex 桌面版的非官方适配：把问答与历史分支放到画布上，在原生聊天顶部切换视图。

> **非原创声明：我不是“将 AI 对话摊成地图”这一项目思路及原插件的原创作者。** 本项目参考 **liangmianya 的 dsh-synapse**，在 AI 协助下制作 Codex 适配与本地界面实现。请优先了解和支持原作者的工作。本仓库并非原作者的官方 Codex 版本，也不代表 OpenAI。
>
> - 原作者 GitHub：[liangmianya](https://github.com/liangmianya)
> - 原项目：[liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse)
> - 原作者抖音视频：[《手搓一个插件，我将 AI 对话摊成一张地图【2.0】》](https://v.douyin.com/5FNvWpwv4eU/)

如果适配版对你有用，欢迎 [Star 收藏](https://github.com/g1066295317-jpg/codex-synapse/stargazers)，也请为 [原项目点 Star](https://github.com/liangmianya/dsh-synapse/stargazers)。

[![Version](https://img.shields.io/badge/version-0.3.4-blue)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](#快速开始)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22-339933)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

![固定节点、分支自动排列与边缘滚动条](./docs/canvas-preview.png)

*实际界面的合成数据截图，不含私人聊天。抖音地址采用用户提供的原始视频分享链接，不冒充已核验的作者主页。完整来源见 [ATTRIBUTION.md](./ATTRIBUTION.md)。*

## 能做什么

- **原生聊天顶部切换**：通过增强启动器打开后，自动挂载“原生对话 / 会话画布”按钮，返回时保留原生界面。
- **按问答轮次看分支**：本机会话按项目或目录分组、搜索；从历史轮次分叉，或选取回答原文引用追问。
- **固定节点，自动排列**：分支不可拖动，新增分支自动排布。滚轮缩放，底部横条与右侧竖条平移；切换分支保持比例。
- **Markdown 与公式**：代码块和本地 KaTeX，支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`。
- **复用本机会话服务**：通过 `codex app-server` 读取和操作会话，不直接改写 Codex 的 SQLite 或 JSONL。

## 快速开始

需要 **Windows、Node.js 22+、已安装并登录的 Codex 桌面客户端及其 CLI**。这是依赖客户端内部 DOM 与路由的界面注入方案，客户端更新可能导致失效。调试接口限定 `127.0.0.1`，具有增强窗口的界面权限，**仅供本机可信环境使用**。

1. 下载源码 ZIP，解压到固定、可写的本地目录。已附 `dist/` 构建结果，直接运行无需安装 npm 依赖。
2. 双击 `演示验收.vbs` 先看合成会话；演示模式不向真实聊天发送消息。
3. 双击 `打开会话画布.vbs` 打开增强窗口，点击聊天顶部“会话画布”。
4. 希望用原来的图标打开：按 [快捷方式接入与恢复](./docs/shortcut.md) 先备份，再将快捷方式指向本地构建的启动器。

启动失败时，在解压目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-native.ps1 -Foreground
```

执行策略仅作用于本次启动，不修改系统策略。本项目不附带 Codex、Node.js、账户或登录凭据。

## 使用方式

点击节点阅读问答；最新轮次可继续原会话，历史轮次或引用追问会建立分支。发送使用已有 Codex 账户与配置。工具审批须明确选择，或切回原生聊天处理。

滚轮缩放，拖动底部横条、右侧竖条平移。右上角“定位当前问答”保留比例，“适应画布”才主动调整比例。节点固定，布局自动计算。

分叉聊天共享原工作目录，**不会创建 Git worktree**；需要代码隔离时使用 Codex 自身的 worktree。仅覆盖本机可访问的 Codex 会话，不覆盖 ChatGPT 云端聊天或其他主机。

## 架构

```text
Windows 启动脚本 / C# 启动器
  -> Node 控制器（runtime/controller.mjs）
  -> 增强客户端窗口 + 顶栏注入（runtime/native-host.mjs）
  -> React Flow 画布（src/NativeWorkspace.jsx）
  -> 受限后端（server/native-backend.mjs）
  -> codex app-server -> Codex 管理的真实会话

视野、折叠、草稿 -> data/local/canvas/
增强窗口浏览器状态 -> data/local/client-profile/
```

原生会话是事实来源。本适配的 Codex 接入与界面单独实现，不依赖 DeepSeek Harness，不分发 Codex 专有安装包或解包资源。

## 开发与验证

```powershell
npm ci
npm run build
npm test
npm run build:launcher
```

`build:launcher` 使用 Windows .NET Framework 4.x C# 编译器生成 `CodexSynapseLauncher.exe`，用于激活已有增强窗口或启动窗口。源码见 [CodexSynapseLauncher.cs](./CodexSynapseLauncher.cs)。

截至 2026-10-25，本机 **53 项合成测试通过**，涵盖历史轮次分支参数、引用、审批、状态、公式与字体、视野保持、滚动条、固定节点和自动排列。浏览器测试需要 Playwright Chromium 或本机 Chrome / Edge；无浏览器时对应项目会跳过，不能把跳过计作通过。

原生顶栏、切换、返回会话、重载恢复和快捷方式启动已在本机验证。**真实账户的模型生成与分支未进行端到端验收**，相关交互以合成后端验证。默认测试不发送真实消息、不创建真实聊天。没有宣称跨版本兼容或完整覆盖率。

## 兼容性与数据边界

- 本机环境：`OpenAI.Codex_26.1021.3705.0`、CLI `0.164.0-alpha.11.1`、Node.js `24.14.1`；其他版本需重新验证，目前仅提供 Windows 启动流程。
- 普通 Codex 入口不会自动加载画布，须使用增强启动器或按文档接入已备份的快捷方式。仓库不会自动修改快捷方式。
- 不修改已安装客户端文件，不直接编辑会话数据库，关闭画布不删除聊天。公式渲染器与字体本地打包，画布无遥测及远程脚本。
- 使用本机 `CODEX_HOME` 和现有登录配置。运行后的 `data/` 可能包含聊天标识、草稿、日志及浏览器登录状态，**不要上传或分享整个运行目录**。源码发布必须排除 `data/`、`.synapse/`、日志及环境文件。
- 浏览会话不调用模型；发送沿用现有账户与工具权限。未知审批格式拒绝执行，不自动批准命令；Codex 自身的联网行为仍由客户端决定。
- 图片、非文本附件及复杂客户端操作请回原生聊天查看。调试端口不得转发至公网。
- 保留本仓库既有 [MIT 许可](./LICENSE)；原项目和依赖仍保留各自许可，见 [来源署名](./ATTRIBUTION.md) 与 [第三方许可](./dist/THIRD_PARTY_NOTICES.txt)。

问题可提交 [Issue](https://github.com/g1066295317-jpg/codex-synapse/issues)，请附版本及脱敏错误。欢迎 [Star 收藏](https://github.com/g1066295317-jpg/codex-synapse/stargazers)，也欢迎到 [dsh-synapse](https://github.com/liangmianya/dsh-synapse) 支持原作者。

