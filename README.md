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

```sh
dsh plugin --profile web add dsh-workspace-groups
```

Restart `dsh web` (or the desktop client) afterwards: a client bundle only enters
the `__DSH_BOOT__` module graph at startup, so a page refresh alone will not load
it.

From a local checkout:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-workspace-groups
```

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
  (`role="tree"`, one section per workspace, `role="treeitem"` rows, and the
  `text/plain` drag payload the folder row writes). It never mutates nodes it
  does not own and never changes drag state, so official reordering keeps
  working.
- Verified against DSH `0.1.2-rc.1` (dsh-desktop 0.8.2) and `0.1.7` (a later
  dsh-desktop) web profiles. If a DSH upgrade changes the official sidebar
  structure the plugin goes quiet, so it re-checks itself 4 seconds after mounting
  and prints an explicit console warning when it cannot find the workspace list —
  instead of pretending everything is fine.

## Known limitations

- Grouping is per browser profile; it does not travel between machines or
  browsers.
- A workspace belongs to at most one group (membership is exclusive).
- Group headers are not part of the official workspace list, so they do not
  appear in the Host registry, in exports, or in any API — only in this client.
- Workspace titles are shown as they are; the plugin does not rename them.

## Troubleshooting A: the plugin vanished after a DSH Desktop upgrade

A desktop upgrade rearranges its own plugin directory (for example from
`harness\plugins\` to `%APPDATA%\dsh-desktop\plugins\`). Two silent consequences:

1. `node_modules\dsh-workspace-groups` inside the profile becomes a **dangling
   junction** pointing at a directory that no longer exists;
2. `dsh-workspace-groups` is **dropped from `dsh.profile.bundles`** (the upgrade
   prunes it because the install looked broken).

One command repairs both — it recreates the junction and puts the bundle entry back:

```powershell
& "C:\Users\ZhangShen\Documents\DSH\dsh-workspace-groups\scripts\link-dev.ps1"
```

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
node scripts/check-profile-mount.mjs --profile web
```

`RESULT: OK` means the plugin is mounted exactly once.

## Development

```sh
node --check client.js   # the client bundle is plain JS, loaded via window.__ModuleLoader__
```

`client.js` is the whole browser half: it registers on the `slots` / `workspaces`
faces and decorates the sidebar. `index.js` is the (empty) Host half. A local
checkout can be mounted by pointing a profile's `node_modules/<name>` at this
directory, but `dsh plugin --profile web add <path>` is the supported route.

## License

MIT
