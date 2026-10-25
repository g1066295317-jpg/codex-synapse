# 快捷方式接入与恢复 / Shortcut setup and restore

可选步骤：先确认 `打开会话画布.vbs` 正常启动，再接入平时使用的图标。仓库不会自动修改系统入口。

Optional: first check the VBS launcher works. No system entry is changed automatically.

1. 将项目放在固定、可写的目录，后续移动会使快捷方式失效。
2. 在该目录运行 `npm run build:launcher`，或下方命令。只编译本仓库源码，不启动客户端。
3. 找到你真正使用的 `.lnk`，**完整复制一份到独立备份目录**。不要只抄“目标”，商店快捷方式可能包含额外元数据。
4. 右键原快捷方式 → 属性，将目标设为项目目录中的 `CodexSynapseLauncher.exe`，起始位置设为项目目录，保留所需名称与图标。
5. 点击图标验证。恢复时将备份 `.lnk` 原样复制回原位置；无需删除聊天或画布数据。

Keep the project in a fixed writable directory, build the launcher, make a complete backup of the actual `.lnk`, then set its target to the executable and working directory to the project root. Restore the original `.lnk` to undo the change.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-launcher.ps1
```

只有商店或开始菜单入口、没有可编辑 `.lnk` 时，可另建普通快捷方式指向启动器；这不会替换原入口。正式快捷方式直接指向 `.exe`，不使用隐藏 VBS 中转。

If you only have a Store/start-menu entry, create a separate ordinary shortcut. It does not replace the original entry. Point regular shortcuts directly at the executable.

失败时查看 `data/local/launcher.log` 和 `data/local/controller.stderr.log`。提交 Issue 前脱敏，不上传浏览器 profile 或聊天正文。

Check those diagnostic logs on failure. Redact them before reporting; do not upload browser profiles or private conversations.

