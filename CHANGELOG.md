# 更新记录 / Changelog

## 0.3.6 — 2026-10-25

- 修复从画布返回原生聊天后的“已在另一个应用中打开”占用问题：先检查画布加载的会话，全部空闲且没有审批或后台命令时，取消订阅并释放画布自己的 RPC 子进程，再由原生聊天正常重试接手。
- 正在生成、等待审批或运行后台命令时保留连接并提示原因，不中断任务、不归档会话、不创建替代分支，也不通过修改 DOM 强制启用输入框。
- 同一个原生会话也执行接手流程；切换期间暂停画布轮询，避免争用。画布服务在后续需要时再建立连接。
- 62 项合成测试通过，0 跳过。另已在已有真实分支上验证原生占用提示消失、输入框可编辑；验证未输入或发送消息。真实模型生成和分支创建仍未做账户端到端验收。

- Fixed native-chat ownership conflicts when returning from the canvas. After checking that all canvas-loaded sessions are idle and have no approvals or background commands, the plugin unsubscribes and releases its own RPC child before native retry/resume.
- Running generation, approvals and background commands retain their connection. No task interruption, archival, replacement fork or forced DOM unlocking is used.
- Returning to the same native thread also performs handoff. Canvas polling pauses during the transition and the RPC service reconnects lazily when needed.
- All 62 synthetic tests pass with no skips. An existing branch was checked for a cleared ownership notice and editable native composer without typing or sending. Real-account model generation and fork creation remain outside end-to-end validation.

## 0.3.5 — 2026-10-25

- 原生侧栏默认折叠画布创建的分支，提供展开入口；按真实分支 ID 识别，保留同名独立聊天。主会话暂未显示时仍保留分支入口。
- 单击画布节点自动打开右侧完整问答，保持当前缩放。展开与收起状态仅存于增强窗口的本机存储，不改变聊天记录。
- 55 项合成测试通过，0 跳过。

- Native sidebar groups canvas-created branches using explicit branch IDs, with expand controls and a fallback when the parent is not listed. Unrelated chats with identical titles stay separate.
- Clicking a canvas node opens the full turn in the right pane while preserving zoom. Sidebar expansion stays in local enhanced-window storage and does not modify chat history.
- All 55 synthetic tests passed with no skips.

## 0.3.4 — 2026-10-25

- 固定节点，新增分支自动排列；保留滚轮缩放，加入底部与右侧拖动条平移。
- 选择分支保持画布比例，公式和字体本地打包。53 项合成测试通过。

- Fixed nodes, automatic branch layout, wheel zoom and draggable bottom/right panning bars.
- Branch selection preserves zoom; math and fonts are bundled locally. 53 synthetic tests passed.

## 来源 / Attribution

本项目非原创，参考 liangmianya 的 [dsh-synapse](https://github.com/liangmianya/dsh-synapse)。原作者 [GitHub](https://github.com/liangmianya) 与 [抖音视频](https://v.douyin.com/5FNvWpwv4eU/) 保留于双语 README 首屏，完整说明见 [ATTRIBUTION.md](./ATTRIBUTION.md)。

This is a non-original, AI-assisted Codex adaptation inspired by dsh-synapse. Original-author links and licensing remain documented in both READMEs and the attribution file.
