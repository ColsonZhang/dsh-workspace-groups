# 提交到插件市场（awesome-dsh-plugin）

市场里的插件列表来自精选列表仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
`dsh-market` 与 <https://awesome-dsh-plugin.com> 都从它生成。收录规则见该仓库的
`contributing.md`，本文件只列与本插件相关的检查项。

## 1. 仓库侧的硬性要求（对照 contributing.md）

| 要求 | 本仓库状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` manifest | ✅ `dsh.bundle.patch = ./cordis.patch.yml` |
| 带前端 UI 时声明 `dsh.client` | ✅ `dsh.client.platform = web` |
| 仓库根有 `cordis.patch.yml`，形如 `- insert: - id … name …` | ✅ 并且带重复挂载守卫 |
| 仓库有真实可用代码（非占位/纯 README） | ✅ `client.js` 为全部实现，`index.js` 为 Host 半 |
| 仓库创建满 1 天（CI 自动检查） | ⏳ 建仓后等一天再提 PR |
| 仓库打上 `dsh-plugin` topic | ⏳ 建仓后在 GitHub 上添加 |
| 描述属实、无营销词 | ✅ 见 `market-entry.yml`，只写功能 |

> 特别提示：只声明 `dsh.client`（缺 `dsh.bundle`）是最常见的被拒原因——本仓库两者都有。

## 2. 提交方式：一个文件

给 `awesome-dsh-plugin` 提 PR，**只新增一个文件**：

```
data/plugins/<owner>__<repo>.yml
```

内容直接用 `docs/market-entry.yml`，把 `REPLACE_WITH_OWNER` 换成你的 GitHub 用户名
（仓库名与本包同名，所以文件名是 `<owner>__dsh-workspace-groups.yml`）。
`url` 必须与仓库地址完全一致，`name` 用 `owner/repo` 形式，`category` 取 `ui`。

注意：

- 描述里若出现半角冒号加空格（`: `）必须给整行加引号，否则 YAML 会当成嵌套键；
  本文件的英文描述没有该模式，中文用的是全角冒号，都安全。
- 不要手工编辑仓库的 README（由脚本生成）。
- 提 PR 时用仓库自带的描述：一句话说明插件做什么 + 上面那张表的勾选情况即可。

## 3. 上架后的安装命令

有 npm 包（推荐，安装更快、可校验完整性）：

```sh
dsh plugin --profile web add dsh-workspace-groups
```

仅 GitHub：

```sh
dsh plugin --profile web add github:REPLACE_WITH_OWNER/dsh-workspace-groups
```

## 4. 发布到 npm（可选但建议）

```sh
npm publish --access public
```

发布前确认：

- `package.json` 里的 `repository` / `bugs` / `homepage` 已把 `REPLACE_WITH_OWNER` 换成真实账号；
- `LICENSE` 里的 `<your name>` 已替换；
- `version` 与本次改动相符（marketplace 的更新检测按 npm 版本或 GitHub HEAD 对比）。
