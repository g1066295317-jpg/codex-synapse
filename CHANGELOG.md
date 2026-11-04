# 更新记录 / Changelog

## 0.3.9 — 2026-10-26

- 已结束的失败和中断轮次也按一致原生 ID 复用，避免把继承上文当作新分支起点。
- 分支锚点不能指回其继承历史，且不得闭合循环；在完整顺序边建立后统一校验。
- 异常循环的排列兜底保留下游顺序，避免将所有受阻节点放在同一横排。
- 首次打开默认定位当前问答，新增 85% 的“阅读视图”；普通节点选择和定位保持用户缩放。
- 80 项合成测试通过，真实账户仅进行只读结构检查。

- Reuse identical terminal failed/interrupted native turns instead of mistaking inherited history for new branch content.
- Validate fork anchors after sequential edges; reject inherited-history back-links and cycle-closing connections.
- Defensive layout retains downstream order rather than flattening all cycle-blocked nodes into one row.
- Start new maps at the active turn and add an explicit 85% reading view; ordinary selection and location keep user zoom.
- 80 synthetic tests pass, with only read-only structural checks on the real account.

## 0.3.8 — 2026-10-26

- 修复共享上文后多路径汇合造成的节点重叠，采用分层排列与明确的卡片间距。
- 缩小画布仍显示问题和回答的轻量纯文本摘录，公式和代码使用简短占位；点击继续加载完整内容。
- 父会话历史页缺失时，同一已知原生分支族内仍可复用一致的原生轮次；无关会话和循环元数据不合并。
- 78 项合成测试通过，保留上一版的按需加载、缓存上限与模型选择。

- Fix card collisions at shared-history convergence points with layered layout and reserved spacing.
- Keep lightweight question/answer excerpts at low zoom; use brief equation/code placeholders and load full content on click.
- Reuse identical native turns within known families even when the parent history page is absent; keep unrelated and cyclic metadata separate.
- 78 synthetic tests pass, retaining lazy loading, bounded caching and model selection.

## 0.3.7 — 2026-10-26

- 按需读取完整问答，预览不包含工具输出或内部推理；工具过程展开后才渲染。
- 固定节点尺寸、可见区域渲染、缩小后的简洁总览。
- 完整问答最近访问缓存最多 16 条、估算 8 MiB；预览保留数量有上限，共享上文按实际祖先关系和一致原生轮次复用。
- 提问区增加可用模型选择，参数传至继续、新讨论和历史分支；默认保持会话设置。
- 75 项合成测试通过；真实账户只读检查不发送消息，不创建、修改或删除聊天。

- Read full turns on demand; previews exclude tool payloads and internal reasoning, while expanded tool panels render their content lazily.
- Stable card dimensions, viewport culling and a lightweight zoomed-out overview.
- Bounded LRU for complete turns (16 entries / estimated 8 MiB), bounded previews and verified ancestor-turn reuse.
- Account-backed model selection for continuations, new chats and historical forks, inheriting session settings by default.
- 75 synthetic tests pass; real-account read-only checks never send messages or create, modify or delete chats.

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
