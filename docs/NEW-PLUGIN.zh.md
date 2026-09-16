# 新增一个插件：从模板到上架

这份清单是 `dsh-workspace-groups` 走通的那条路，按顺序照做即可。

## 1. 复制模板

```powershell
$repo = "C:\Users\ZhangShen\Documents\DSH\dsh-workspace-groups"
Copy-Item "$repo\docs\new-plugin-template" "C:\Users\ZhangShen\Documents\DSH\<new-plugin>" -Recurse
```

把 `<your-plugin-name>` / `<plugin-id>` / `<owner>` 全部替换成真实值。命名建议：

- 包名（`package.json.name`）：`dsh-<领域>-<能力>`，全小写连字符；
- loader id（`cordis.patch.yml` 的 `id`）：短横线短语，与包名不同以免和自动生成的 id 撞；
- 仓库名与包名保持一致，方便 `dsh plugin add github:<owner>/<repo>`。

## 2. 让它在本地跑起来

```powershell
# 有 dsh CLI 时（推荐）
dsh plugin --profile web add "C:\Users\ZhangShen\Documents\DSH\<new-plugin>"

# 桌面端没有 CLI 时，走联接装配
& "C:\Users\ZhangShen\Documents\DSH\dsh-workspace-groups\scripts\link-dev.ps1"
```

**改完客户端代码必须重启 DSH**：客户端包只在启动时进入 `__DSH_BOOT__` 模块图，
刷新页面不生效。

## 3. 自查（三条硬性要求）

1. `package.json` 里有 `dsh.bundle.patch` —— 只有 `dsh.client` **不能**安装，这是市场
   最常见的打回原因；
2. 仓库根有 `cordis.patch.yml`，`- insert:` 下是一个 `id` + `name:` 行；
3. 仓库里有真正能跑的代码，不是占位、不是纯 README。

本地跑 CI 的同一套检查：

```powershell
cd "C:\Users\ZhangShen\Documents\DSH\<new-plugin>"
node --check index.js
node --check client.js
node -e "const p=require('./package.json'); if(p.dsh?.bundle?.patch!=='./cordis.patch.yml') throw new Error('need dsh.bundle.patch')"
```

## 4. 调试习惯（省时间的关键）

客户端插件最容易踩的坑不是逻辑，而是**看不见**：

- 给插件的所有 DOM 节点一个自有命名空间属性（如 `data-dsh-xx="…"`），只读不自造；
- 埋一个环形诊断缓冲 + `window.__dshXxDiagnose()`，把"认到了什么"打出来；
- 留一个急停开关（`window.__dshXxOff = true`）与一个重新启用入口；
- 面板/菜单类 UI 自己实现，不要用 `window.prompt` / `window.confirm`：打包后的
  Electron 里它们可能直接返回 `null`，表现为"点了没反应"；
- 不依赖 `--dsw-alias-*` 之类的主题变量做配色：侧边栏里它们可能未定义，会让文字与
  背景同时失配。用 `color: inherit` + `opacity` 与中性半透明色最稳。

## 5. 上架

```powershell
cd "C:\Users\ZhangShen\Documents\DSH\<new-plugin>"
git init
git add .
git commit -m "feat: initial plugin"
git remote add origin https://github.com/REPLACE_WITH_OWNER/<new-plugin>.git
git push -u origin main
```

然后：

1. 给仓库加 GitHub topic `dsh-plugin`；
2. 建仓满 1 天后再提 PR（CI 会自动检查仓库年龄）；
3. 往 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
   提一个 PR，只新增 `data/plugins/REPLACE_WITH_OWNER__<repo>.yml`，内容照
   `docs/market-entry.yml` 的格式（`category` 自己选准，描述必须与代码相符）；
4. 可选：`npm publish --access public`，装上后安装会更快、可校验完整性。

细节见 [SUBMIT.zh.md](./SUBMIT.zh.md)。

## 6. 两条踩出来的经验（本仓库真踩过）

1. **同一个 loader id 只能挂一次，而且 `disabled` 不能豁免。** loader 的重复检查只比对
   `id`（`EntryGroup.update` 里的 `seen` 集合），根本不看 `disabled`。所以既声明了
   `dsh.bundle.patch`（bundle 会插一行），又在 profile 的 `cordis.patch.yml` 里手写一行
   同名 id，就会以 `duplicate loader entry id` 拒绝启动整个插件树（DSH Desktop 落安全
   模式）。把那行改成 `disabled: true` **没有用**——必须删掉，或给它换一个 id。
   本仓库的 `scripts/check-profile-mount.mjs` 就是为此写的自检脚本。
2. **诊断要当成功能来做。** 侧边栏这类 DOM 叠加插件最大的成本不是写逻辑，而是"看不见
   到底认到了什么"。本仓库最后能定位问题，靠的是：环形诊断缓冲 + `window.__dshXxDiagnose()`
   （把识别到的容器/条目/计算样式打出来）、每个决策点一条事件日志、以及一个即时开关。
   没有这些，前面几轮全是盲修。
