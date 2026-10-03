# dsh-workspace-groups

[中文](README.zh.md) | English

[![npm](https://img.shields.io/npm/v/dsh-workspace-groups)](https://www.npmjs.com/package/dsh-workspace-groups)

Collapsible **workspace groups** for the DSH sidebar. Fold related workspaces into
named groups, fold those groups away when you are not using them, and keep the
grouping in the browser.

The sidebar normally shows every registered workspace as one flat list. This
plugin inserts its own group headers around that list — empty groups included —
so a large workspace set stays navigable. It does not fork the official
workspace browser and does not touch the Host registry: workspaces, sessions and
their storage keep working exactly as before.

## Install

Official **DeepSeek Harness** desktop app (profile `desktop`), from a local checkout:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-workspace-groups
```

The community DSH Desktop uses the profile `web` instead:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-workspace-groups
```

Restart DSH afterwards: a client bundle only enters the `__DSH_BOOT__` module
graph at startup, so a page refresh alone will not load it.

`scripts/install.ps1` does the same and picks the profile automatically
(`$DSH_PROFILE`, else `desktop` / `web` / `tui`, whichever exists).

## What you get

- **Group headers with a member count**, collapsible with a click, `Enter`/`Space`
  on the focused header, or the chevron. The `未分组` / `Ungrouped` bucket folds
  too, and its folded state is stored with the named groups.
- **Drag a group header** onto the upper or lower half of another header to move
  that group before or after it; drop it on the empty space below the list to
  move it to the end. `Ungrouped` always trails the list and cannot be moved.
- **A group manager** — the button above the workspace list opens a panel that
  lists every group (rename, delete) and every workspace with one button per
  group, so membership is one click. Empty groups are shown with a count of
  `空` / `empty`, never hidden.
- **Drag to group** — drop a workspace row on a group header, or on any row of
  another group, to move it there. Intra-group reordering is left entirely to the
  official list.
- **Right-click a workspace row** for the same move as a menu.
- **Ungrouped workspaces** stay together under a `未分组` / `Ungrouped` header at
  the end of the list.

Grouping is browser-local: `localStorage['dsh.workspace.groups.v1']`.

## Interaction

| Where | Action |
| --- | --- |
| `管理分组` / `Manage groups` button above the list | Open the group manager |
| Right-click a workspace row | Move that workspace into a group |
| Click a group header, chevron, `Enter`, `Space` | Collapse / expand the group (`Ungrouped` included) |
| Drag a group header | Reorder groups; an insertion line shows where it lands |
| Double-click a group name, or the `⋯` on its right | Rename / move all out / delete |
| `⋯` above the list | New group, collapse all, expand all, refresh, copy diagnostics, disable for this session |
| Drag a workspace row onto a group header or another group's row | Move it into that group |

## Grouping state

```js
// Keys are Host workspaceIds when the workspace projection is readable, and
// `label:<title>` otherwise.
localStorage['dsh.workspace.groups.v1'] = JSON.stringify({
  groups: [
    { id: 'g1', name: 'Tapeout', workspaces: ['<workspaceId>', 'label:ISSCC'] },
  ],
  collapsed: ['g1'],
})
```

## Diagnostics and switches

```js
window.__dshWgDiagnose()    // containers, sections, group headers, computed styles, recent events
window.__dshWgLog           // raw event ring buffer
window.__dshWgOff = true    // strip every decoration immediately (state is kept)
window.__dshWgOn()          // re-enable
```

`window.__dshWgLog === undefined` means the plugin never mounted — an
installation problem, not a DOM problem.

## Compatibility

- Client-only: the Host half is an empty `apply()`, so nothing is registered on
  the Host side.
- The sidebar decoration relies on the official workspace browser's DOM contract
  (`role="tree"`, one section per workspace, a folder row carrying
  `projectRow`/`projectText`, session rows as `treeitem`s, and the `text/plain`
  drag payload the folder row writes). It never mutates nodes it does not own and
  never changes drag state, so official reordering keeps working.
- Verified against DSH `0.2.0-rc.2` (the official DeepSeek Harness desktop,
  profile `desktop`), and against `0.1.2-rc.1` (dsh-desktop 0.8.2) and `0.1.7`
  (a later dsh-desktop) web profiles.
- The plugin's `@deepseek-ai/dsh-*` peer ranges are written as `>=` (the
  convention used by other community plugins), because the dsh CLI refuses to
  install a plugin whose peers do not satisfy the running dsh version. If a
  future DSH release changes the sidebar structure the plugin goes quiet, so it
  re-checks itself 4 seconds after mounting and says exactly what it could not
  find instead of pretending everything is fine.

### Which sidebar views are decorated

DSH 0.2's sidebar renders three different views behind the same "Sessions"
heading. Only the flat, workspace-grouped one — the default — is decorated:

| View (view-options menu) | Behaviour |
| --- | --- |
| Workspace (`工作区`, default) | Groups are inserted, collapsed and reordered normally. |
| One list (`一个列表`, flat sessions) | Untouched: those rows are sessions, not workspaces, so a group header there would be meaningless. Console says so once. |
| Workspace tree (`工作区树`, hierarchical) | Untouched, toolbar included: child workspaces live inside their parent's section, so flat regrouping would move non-sibling rows. Console says so once. |
| Search results | Untouched (session rows only). |

Switching back to the Workspace view restores the groups immediately.

## Known limitations

- Grouping is per browser profile; it does not travel between machines or
  browsers.
- A workspace belongs to at most one group (membership is exclusive).
- Group headers are not part of the official workspace list, so they do not
  appear in the Host registry, in exports, or in any API — only in this client.
- Workspace titles are shown as they are; the plugin does not rename them.
- Grouping only applies to the flat Workspace view (see above); the hierarchical
  "Workspace tree" view is deliberately left alone.

## Troubleshooting A: the plugin vanished after a DSH Desktop upgrade

A desktop upgrade rearranges its own plugin directory (for example from
`harness\plugins\` to `%APPDATA%\dsh-desktop\plugins\`). Two silent consequences:

1. `node_modules\dsh-workspace-groups` inside the profile becomes a **dangling
   junction** pointing at a directory that no longer exists;
2. `dsh-workspace-groups` is **dropped from `dsh.profile.bundles`** (the upgrade
   prunes it because the install looked broken).

One command repairs both — it recreates the junction and puts the bundle entry back:

```powershell
& "<repo>\scripts\link-dev.ps1"
```

On the official app the profile and home are detected automatically (or pass
`-Profile desktop -DshHome "$env:USERPROFILE\.dsh"`).

Then confirm with the pre-flight check, which verifies both the install resolution
and the bundle registration:

```sh
node scripts/check-profile-mount.mjs --profile web
```

Restart DSH and the groups come back. If they do not, but the console shows
`已挂载，但在侧边栏里没找到工作区列表`, the official sidebar DOM changed and the
selectors need updating — `window.__dshWgDiagnose()` says exactly what is missing.

## Troubleshooting B: safe mode / duplicated mount

If DSH Desktop reports `duplicate loader entry id: workspace-groups` and drops into
safe mode, one loader id is being mounted twice: this package declares
`dsh.bundle.patch`, so a `dsh-workspace-groups` entry in `dsh.profile.bundles`
already inserts `id: workspace-groups`; a row with the same id in the profile's
`cordis.patch.yml` then collides, and the loader refuses to boot the whole tree.

**The loader's duplicate check ignores `disabled`:**

```js
// @deepseek-ai/cordis-plugin-loader, EntryGroup.update
for (const options of config) {
  const id = this.tree.ensureId(options)
  if (seen.has(id)) throw new TypeError(`duplicate loader entry id: ${id}`)
  seen.add(id)
}
```

So writing `disabled: true` on the profile row does **not** avoid the collision —
the id has to disappear: delete the row, or give it a different id (this profile
keeps a tombstone row named `workspace-groups-tombstone-do-not-enable` for the
record).

Two valid wirings, pick one:

- **bundle channel (recommended; what `dsh plugin add` and the market use)**:
  `dsh.profile.bundles` contains the plugin and the patch layer never mentions
  `workspace-groups`;
- **manual channel**: the patch layer inserts `id: workspace-groups` and the plugin
  is removed from `dsh.profile.bundles`.

Check before restarting — the script flags a disabled-but-same-id row too:

```sh
node scripts/check-profile-mount.mjs --profile desktop
```

`RESULT: OK` means the plugin is mounted exactly once. The profile defaults to
`$DSH_PROFILE`, else `desktop` / `web` / `tui`, whichever exists.

## Troubleshooting C: `installation rejected: ... is incompatible with dsh X`

`dsh plugin add` compares the running dsh version against the plugin's
`@deepseek-ai/dsh-*` `peerDependencies` and refuses a plugin whose ranges do not
satisfy it (exemptions require `dsh plugin allow-version … --accept-risk`). This
plugin declares `>=0.1.2-rc.1`, which satisfies every `0.1.x`/`0.2.x` runtime, so
the message means the installed copy predates 0.1.3 — update the checkout and
reinstall. The releases actually exercised by hand are listed in
`package.json` → `dsh.compatibility.dshReleases`.

## Development

```sh
node --check client.js   # the client bundle is plain JS, loaded via window.__ModuleLoader__
```

`client.js` is the whole browser half: it subscribes to the client `workspaces`
service and decorates the sidebar's DOM. `index.js` is the (empty) Host half. A
local checkout can be mounted by pointing a profile's `node_modules/<name>` at
this directory, but `dsh plugin --profile desktop add <path>` is the supported
route.

## License

MIT
