# dsh-workspace-groups

[English](README.md) | 中文

[![npm](https://img.shields.io/npm/v/dsh-workspace-groups)](https://www.npmjs.com/package/dsh-workspace-groups)

给 DSH 侧边栏的工作区列表加**可折叠分组**：把相关的工作区收进命名分组，不用时整组折叠，
分组信息存在浏览器里。

侧边栏默认把每个已注册工作区平铺成一行。本插件在这份列表上叠加自己的分组标题
（**空分组也显示**），让工作区多的场景仍然好用。它不 fork 官方的 workspace 浏览器，
也不碰 Host 侧注册表：工作区、会话及其存储的行为完全不变。

## 安装

```sh
dsh plugin --profile web add dsh-workspace-groups
```

装完要**重启** `dsh web`（或桌面端）：客户端包只在启动时进入 `__DSH_BOOT__` 模块图，
只刷新页面不会加载它。

从本地目录安装：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-workspace-groups
```

## 你会得到

- **带成员数的分组标题**：点击、聚焦后按 `Enter`/`Space`、或点标题左侧箭头都能折叠。
  「未分组」这一组同样可以折叠，折叠状态与命名分组一起保存。
- **拖拽调整分组顺序**：直接把分组标题拖到另一个分组标题的上/下半区，即可把该组插到
  它前面或后面；拖到列表末尾空白处则移到最后。「未分组」固定排在最后，不能移动。
- **分组管理面板**：列表上方的按钮打开它——上半是分组清单（重命名、删除），下半是每个
  工作区一排按钮（每个分组一个），点击即归属切换。**空分组也会显示**，成员数标为「空」。
- **拖拽入组**：把工作区行拖到分组标题上，或拖到别的分组的任意一行上，即可移入该组。
  组内上下排序完全交给官方列表，本插件不介入。
- **右键工作区行**：同一套「移入分组」菜单。
- **未分组的工作区**仍然集中在列表末尾的「未分组」标题下。

分组信息是浏览器本地的：`localStorage['dsh.workspace.groups.v1']`。

## 交互

| 位置 | 操作 |
| --- | --- |
| 列表上方「管理分组」按钮 | 打开分组管理面板 |
| 右键工作区行 | 把该工作区移入某个分组 |
| 点击分组标题 / 箭头 / `Enter` / `Space` | 折叠或展开该分组（**「未分组」同样可折叠**） |
| **拖拽分组标题** | 调整分组之间的上下顺序；标题上会显示插入线，拖到列表末尾空白处则移到最后 |
| 双击分组名，或点标题右侧 `⋯` | 重命名 / 全部移出 / 删除分组 |
| 列表上方 `⋯` | 新建分组、折叠全部、展开全部、刷新、复制诊断、本次会话停用 |
| 把工作区行拖到分组标题或其它分组的行上 | 移入该分组 |

## 分组数据

```js
// 键优先是 Host 的 workspaceId；读不到投影时退化为 `label:<标题>`。
localStorage['dsh.workspace.groups.v1'] = JSON.stringify({
  groups: [
    { id: 'g1', name: '流片项目', workspaces: ['<workspaceId>', 'label:ISSCC'] },
  ],
  collapsed: ['g1'],
})
```

## 诊断与开关

```js
window.__dshWgDiagnose()    // 容器、工作区节、分组标题、计算样式、最近事件
window.__dshWgLog           // 原始事件环形缓冲
window.__dshWgOff = true    // 立即摘掉全部叠加（数据保留）
window.__dshWgOn()          // 重新启用
```

`window.__dshWgLog === undefined` 表示插件根本没挂载——那是装配问题，不是 DOM 问题。

## 兼容性

- 纯客户端插件：Host 半是空的 `apply()`，不在 Host 侧注册任何东西。
- 侧边栏叠加依赖官方 workspace 浏览器的 DOM 约定（`role="tree"`、每个工作区一个节、
  行是 `role="treeitem"`、文件夹行在 `dragstart` 写入 `text/plain` 拖动负载）。它不改动
  不属于自己的节点、不干预拖拽状态，因此官方排序照常工作。
- 已在 DSH `0.1.2-rc.1`（dsh-desktop 0.8.2 的 web profile）上验证。

## 已知限制

- 分组属于当前浏览器配置：不跨机器、不跨浏览器。
- 一个工作区最多属于一个分组（归属互斥）。
- 分组标题不是官方工作区列表的一部分，因此不会出现在 Host 注册表、导出或任何 API 里，
  只存在于本客户端界面。
- 不改工作区标题，只做归类。

## 排障：安全模式 / 重复挂载

报错形如 `duplicate loader entry id: workspace-groups` 并进入安全模式，说明同一个
loader id 被挂载了两次：本插件自带 `dsh.bundle.patch`，只要 profile 的
`dsh.profile.bundles` 里有 `dsh-workspace-groups`，bundle 就会插入
`id: workspace-groups`；此时 profile 的 `cordis.patch.yml` 里若还有一条同 id 的行，
就会撞车。

**关键细节：loader 的重复检查不看 `disabled`。**

```js
// @deepseek-ai/cordis-plugin-loader, EntryGroup.update
for (const options of config) {
  const id = this.tree.ensureId(options)
  if (seen.has(id)) throw new TypeError(`duplicate loader entry id: ${id}`)
  seen.add(id)
}
```

所以把手工行写成 `disabled: true` **不能**避开冲突——必须让这个 id 不再出现：
删掉那行，或给它换一个 id（本项目 profile 里就留了一条 id 为
`workspace-groups-tombstone-do-not-enable` 的墓碑行作为记录）。

两种合法装配，二选一：

- **bundle 通道（推荐，市场安装走这条）**：`dsh.profile.bundles` 里有本插件，
  patch 层不出现 `workspace-groups`；
- **手工通道**：patch 层插入 `id: workspace-groups`，并且把本插件从
  `dsh.profile.bundles` 移除。

重启前先自检（它按上面两条规则判定，并把"已停用但同 id"也标为问题）：

```sh
node scripts/check-profile-mount.mjs --profile web
```

看到 `RESULT: OK` 再启动。

## 开发

```sh
node --check client.js   # 客户端包是纯 JS，经 window.__ModuleLoader__ 加载
```

`client.js` 是全部浏览器端逻辑（注册在 `slots` / `workspaces` 面上并装饰侧边栏），
`index.js` 是空的 Host 半。本地目录可以靠 profile 的 `node_modules/<name>` 指向本仓库来
挂载，但推荐走 `dsh plugin --profile web add <path>`。

## 许可

MIT
