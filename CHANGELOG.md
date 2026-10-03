# Changelog

本文件记录本插件（`dsh-workspace-groups`）的对外变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [0.1.3] — 2026-10-03

适配官方 **DeepSeek Harness** 桌面端（dsh `0.2.0-rc.2`，应用 `@deepseek-ai/dsh-desktop`
0.2.0-rc.2）。已在该版本上用 profile `desktop` 实测：安装通过、客户端挂载、分组标题与
管理栏正常渲染。社区版 `0.1.2-rc.1` / `0.1.7-rc.2` 仍然支持。

### Fixed

- **官方 dsh 拒绝安装（致命的兼容性阻断）**。dsh CLI 会用运行时的 dsh 版本去匹配插件的
  `peerDependencies`：原来的 `^0.1.2-rc.1` 不满足运行时 `0.2.0-rc.2`，安装直接失败
  （`installation rejected: Plugin dsh-workspace-groups@0.1.2 is incompatible with dsh 0.2.0-rc.2`），
  必须先 `allow-version` 豁免才能装上。现在两个 `@deepseek-ai/dsh-*` peer 改为
  `>=0.1.2-rc.1`（`dsh-context` 等社区插件同样写法），官方 CLI 无需豁免即可安装。
- **0.2 侧边栏的三种视图被误装饰**。0.2 的侧边栏除了分组工作区列表，还会渲染
  「一个列表」（扁平会话列表）与搜索结果——它们同样是 `[role="tree"]` 且子节点同样带
  `treeitem`，旧版结构判定把扁平列表整段当成了一个工作区节，插入了一个错误的「未分组」
  标题并对其排序/折叠。现在只有"含工作区文件夹行（`projectRow`/`projectText`）"的树才被
  认作工作区列表。
- **层级「工作区树」视图**：该视图把子工作区嵌在父工作区节内部。此时顶层节数少于已注册
  工作区数，插件会整体跳过装饰（含管理栏），而不是把非兄弟节点当成同级分组移动/隐藏。
- 修复 `window.__dshWgOff = true` 后再执行 `window.__dshWgOn()` 管理栏不会恢复的问题。

### Changed

- `dsh.client.inject` 改为 `@deepseek-ai/dsh-api-workspace-controller` +
  `@deepseek-ai/dsh-client-ui-sidebar`（原来的 `@deepseek-ai/dsh-client-ui-slots` 在 0.1/0.2 中
  都是启动表里的静态模块，不是加载器条目，列在 `inject` 里没有意义）。
- 新增 `dsh.compatibility.dshReleases`，记录已实测的 dsh 版本（社区插件惯例，供插件市场展示）。
- 找不到工作区列表时的提示区分两种情况：当前视图本就不支持分组（信息级，说明切回
  「工作区」视图即可）与官方 DOM 结构真的变了（警告级）。
- `scripts/_lib.mjs` 同时支持两种安装布局：官方 DeepSeek Harness（`%LOCALAPPDATA%\Programs\
  DeepSeek Harness`，DSH_HOME 默认 `~/.dsh`）与社区 DSH Desktop（`%APPDATA%\dsh-desktop\harness`）。
  `install.ps1` / `link-dev.ps1` / `check-profile-mount.mjs` 会自动识别 `DSH_HOME` 与 profile
  （`$DSH_PROFILE`，否则 `desktop` / `web` / `tui` 中第一个存在的）。
- `check-profile-mount.mjs` 在取不到内置 YAML 解析器时退化为文本扫描，不再直接抛错。

### Notes

- 官方桌面端的 profile 名是 `desktop`（社区版是 `web`）：
  `dsh plugin --profile desktop add <仓库绝对路径>`。
- 已实测的三种侧边栏视图行为：「工作区」（默认）正常分组；「一个列表」与「工作区树」
  完整保留官方 DOM，不做任何装饰。

## [0.1.2] — 2026-09-29

已在 DSH `0.1.7`（较新的 dsh-desktop）web profile 上验证；本版主题是"DSH 升级后不再失效"。

### Added

- 挂载后自检：4 秒内若找不到工作区列表，控制台打印明确警告（说明是 DSH 升级后官方
  侧边栏 DOM 变化、需要更新选择器），并记录 `container-probe` 事件；不再静默失效。

### Fixed

- **DSH Desktop 升级后插件消失**：升级会重排桌面的插件目录并清掉失效的 bundle 登记，
  导致 profile 里的联接悬空、`dsh.profile.bundles` 丢掉本插件。`scripts/link-dev.ps1`
  现在以"联接能否解析出 package.json"为准自动重建，并补回 bundle 登记；
  `scripts/check-profile-mount.mjs` 也把这两种情况列为错误。
- `scripts/link-dev.ps1` / `scripts/install.ps1` 加 UTF-8 BOM：Windows PowerShell 5.1
  在无 BOM 时按 ANSI 解码，会把脚本里的中文变成解析错误（`.gitattributes` 固定为
  `UTF-8-BOM` + CRLF，保证每次 clone 都一致）。
- 体检脚本不再硬编码 DSH 安装路径：自动在 `resources/app.asar.unpacked` 与
  `resources/app` 之间探测安装根、node 与 yaml，并用无 BOM 读取 profile manifest。

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
