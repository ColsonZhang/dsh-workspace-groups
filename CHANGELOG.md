# Changelog

本文件记录本插件（`dsh-workspace-groups`）的对外变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

## [0.1.1] — 2026-09-15

首个对外版本，已在 DSH `0.1.2-rc.1`（dsh-desktop 0.8.2 的 web profile）上验证。

### Added

- 侧边栏工作区的可折叠分组标题，成员数实时显示；**空分组也会渲染**（成员数显示「空」），
  避免"新建分组后毫无反馈"。
- 分组管理面板：分组清单（重命名 / 删除）+ 每个工作区一排归属按钮（点一下即切换），
  底部输入框可新建分组。
- **拖拽调整分组顺序**：把分组标题拖到另一个标题的上/下半区插入其前/后，拖到列表末尾
  空白处移到最后；拖动时显示插入线。分组的工作区跟随标题一起移动。
- 「未分组」作为末尾分组参与折叠与展开，折叠状态与命名分组一起持久化。
- 右键工作区行 → 「移入分组 …」快捷菜单。
- 组内工作区排序与官方列表行为完全一致（本插件在归属未变化时不接管 drop）。
- 诊断与开关：`window.__dshWgDiagnose()`、`window.__dshWgLog`、`window.__dshWgOff`、
  `window.__dshWgOn()`。
- 打包与自检脚本：`scripts/verify-package.mjs`（manifest、补丁行、客户端哈希基线）、
  `scripts/check-profile-mount.mjs`（profile 挂载冲突预检）、`scripts/install.ps1`、
  `scripts/link-dev.ps1`。
- 新插件起手模板与上架流程文档：`docs/new-plugin-template/`、`docs/NEW-PLUGIN.zh.md`、
  `docs/SUBMIT.zh.md`、`docs/market-entry.yml`。

### Notes

- 纯客户端插件：Host 半是空的 `apply()`。
- 分组数据存 `localStorage['dsh.workspace.groups.v1']`，键优先使用 Host `workspaceId`。
- 不支持跨浏览器/跨机器同步分组；一个工作区只属于一个分组。
- 打包的 Electron 中 `window.prompt` / `window.confirm` 可能直接返回 `null`，
  因此所有输入与确认都使用页面内对话框。
- 本插件声明 `dsh.bundle.patch`，因此 profile 的 `cordis.patch.yml` 里**不能再**出现
  `id: workspace-groups`——loader 的重复检查不看 `disabled`，重复即拒绝启动。
  详见 README 的排障章节。
