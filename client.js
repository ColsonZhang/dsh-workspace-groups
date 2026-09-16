/**
 * dsh-workspace-groups — client half.
 *
 * Adds collapsible GROUP headers to the sidebar's existing workspace list
 * without forking `@deepseek-ai/dsh-client-ui-workspace`.
 *
 * ## The DOM contract this relies on (read from the official package)
 *
 *   <div role="tree">                        ← the workspace list, flat block flow
 *     <div ...>                              ← ONE WORKSPACE SECTION (groupSection)
 *       <div role="treeitem" draggable>      ← the folder row; drag payload text/plain = row.key
 *       <div role="treeitem">…</div>         ← session rows (only when expanded)
 *     </div>
 *     <div ...>                              ← next workspace section
 *   </div>
 *
 * A workspace section is therefore exactly "a direct child of the tree that
 * wraps a direct-child `treeitem`". Session rows are themselves direct children
 * carrying the `treeitem` role, which is what tells the two apart. This module
 * never mutates anything during a drag and never touches nodes it does not own.
 *
 * ## What it changes
 *
 *   - inserts its own sibling nodes (`data-dsh-wg="header" | "divider" | "bar"`)
 *     between React-owned sections;
 *   - sets `order` on sections and gives the tree `display:flex; flex-direction:
 *     column`, so groups lay out in the configured order without moving nodes;
 *   - hides collapsed sections with `display:none`.
 *
 * ## Grouping state
 *
 * `localStorage['dsh.workspace.groups.v1']`; keys are Host workspaceIds when the
 * injected `workspaces` projection is readable, else `label:<title>`.
 *
 * ## Kill switch and diagnostics
 *
 * `window.__dshWgOff = true` removes every decoration immediately, and
 * `localStorage['dsh.workspace.groups.v1.off'] = '1'` keeps it off across
 * reloads. `window.__dshWgDiagnose()` prints what the plugin currently sees;
 * `window.__dshWgLog` holds the recent event log.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-groups',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const STORAGE_KEY = 'dsh.workspace.groups.v1'
    const OFF_KEY = 'dsh.workspace.groups.v1.off'
    const ATTR = 'data-dsh-wg'
    const NS = 'dsh-workspace-groups'
    /** Stored/collapsed sentinel for the trailing "ungrouped" bucket. */
    const UNGROUPED = ''
    const UNGROUPED_NAME = '未分组'
    const GROUP_MIME = 'application/x-dsh-wg-group'

    /** Rolling in-page diagnostics; read them with `window.__dshWgLog`. */
    const DIAG = []
    function diag(event, detail) {
      const entry = { at: new Date().toISOString().slice(11, 23), event, detail }
      DIAG.push(entry)
      if (DIAG.length > 60) DIAG.shift()
      try {
        window.__dshWgLog = DIAG
      } catch {
        /* diagnostics stay in memory when the page forbids globals */
      }
      return entry
    }

    // ---------------------------------------------------------------- storage

    /** Read the durable grouping state; always returns a usable shape. */
    function readState() {
      const empty = { groups: [], collapsed: [] }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return empty
        const parsed = JSON.parse(raw)
        const groups = Array.isArray(parsed?.groups)
          ? parsed.groups
              .filter((group) => group !== null && typeof group === 'object')
              .map((group, index) => ({
                id: typeof group.id === 'string' && group.id !== '' ? group.id : `g${index}`,
                name: typeof group.name === 'string' && group.name !== '' ? group.name : `分组 ${index + 1}`,
                workspaces: Array.isArray(group.workspaces)
                  ? group.workspaces.filter((key) => typeof key === 'string' && key !== '')
                  : [],
              }))
          : []
        const collapsed = Array.isArray(parsed?.collapsed)
          ? parsed.collapsed.filter((id) => typeof id === 'string')
          : []
        return { groups, collapsed }
      } catch (error) {
        console.warn(`[${NS}] 无法读取分组配置，已按空配置运行：`, error)
        return empty
      }
    }

    /** Persist the grouping state; failures stay non-fatal. */
    function writeState(state) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch (error) {
        console.warn(`[${NS}] 无法保存分组配置：`, error)
      }
    }

    /** The group owning a workspace key, or undefined for ungrouped. */
    function groupOf(state, key) {
      return state.groups.find((group) => group.workspaces.includes(key))
    }

    /** Move a workspace key out of every group and optionally into `targetId`. */
    function place(state, key, targetId) {
      for (const group of state.groups) {
        group.workspaces = group.workspaces.filter((entry) => entry !== key)
      }
      if (targetId !== undefined) {
        const target = state.groups.find((group) => group.id === targetId)
        if (target !== undefined) target.workspaces.push(key)
      }
    }

    // ------------------------------------------------------------------ styles

    function ensureStyles() {
      if (document.querySelector(`style[data-plugin=${JSON.stringify(NS)}]`) !== null) return
      const style = document.createElement('style')
      style.dataset.plugin = NS
      style.textContent = `
[${ATTR}] { box-sizing: border-box; }
[${ATTR}="tree"] { display: flex; flex-direction: column; }
[${ATTR}="tree"] > * { flex: none; }
[${ATTR}="header"] {
  display: flex; align-items: center; gap: 4px;
  height: 30px; margin: 6px 0 2px; padding: 0 2px;
  border-radius: 8px; border: 0; background: transparent;
  color: inherit; opacity: .78;
  font: inherit; font-size: 12px; font-weight: 600; line-height: 18px;
  text-shadow: none; user-select: none; cursor: grab;
}
[${ATTR}="header"]:active { cursor: grabbing; }
[${ATTR}="header"]:hover { background: rgba(127, 127, 127, .18); opacity: 1; }
[${ATTR}="header"][data-drop="active"] { outline: 1px dashed currentColor; background: rgba(127, 127, 127, .22); opacity: 1; }
[${ATTR}="header"][data-drop="before"] { box-shadow: 0 -2px 0 0 currentColor; opacity: 1; }
[${ATTR}="header"][data-drop="after"] { box-shadow: 0 2px 0 0 currentColor; opacity: 1; }
[${ATTR}="chevron"] { flex: none; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; opacity: .8; transition: transform .12s ease; }
[${ATTR}="header"][data-collapsed="true"] [${ATTR}="chevron"] { transform: rotate(-90deg); }
[${ATTR}="name"] { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[${ATTR}="count"] { flex: none; opacity: .65; font-variant-numeric: tabular-nums; }
[${ATTR}="actions"] { flex: none; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; opacity: 0; font: inherit; font-size: 13px; line-height: 1; }
[${ATTR}="header"]:hover [${ATTR}="actions"] { opacity: .85; }
[${ATTR}="actions"]:hover { background: rgba(127, 127, 127, .24); }
[${ATTR}="divider"] { height: 1px; margin: 8px 2px 2px; background: currentColor; opacity: .22; }
[${ATTR}="bar"] { display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 2px; }
[${ATTR}="barPrimary"] {
  border: 1px solid rgba(127, 127, 127, .45); border-radius: 6px; cursor: pointer;
  background: transparent; color: inherit; opacity: .85;
  padding: 0 8px; font: inherit; font-size: 11px; line-height: 20px;
}
[${ATTR}="barPrimary"]:hover { background: rgba(127, 127, 127, .18); opacity: 1; }
[${ATTR}="barButton"] { border: 0; border-radius: 6px; background: transparent; cursor: pointer; padding: 0 6px; color: inherit; opacity: .6; font: inherit; font-size: 11px; line-height: 20px; }
[${ATTR}="barButton"]:hover { background: rgba(127, 127, 127, .18); opacity: 1; }
[${ATTR}="menu"] {
  position: fixed; z-index: 2147483000; min-width: 176px; padding: 4px;
  border-radius: 10px; border: 1px solid rgba(127, 127, 127, .35);
  background: #262626; color: #ededed;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45); font-size: 12px; line-height: 18px;
}
[${ATTR}="menuTitle"] { padding: 4px 8px; opacity: .6; font-size: 11px; }
[${ATTR}="menuItem"] { display: block; width: 100%; text-align: left; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; padding: 5px 8px; font: inherit; font-size: 12px; line-height: 18px; }
[${ATTR}="menuItem"]:hover { background: rgba(255, 255, 255, .12); }
[${ATTR}="menuItem"][data-tone="danger"] { color: #ff8f8f; }
[${ATTR}="menuSep"] { height: 1px; margin: 4px 6px; background: rgba(127, 127, 127, .35); }
[${ATTR}="overlay"] { position: fixed; inset: 0; z-index: 2147483001; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .32); }
[${ATTR}="dialog"] {
  width: min(320px, calc(100vw - 32px)); padding: 14px; border-radius: 12px;
  border: 1px solid rgba(127, 127, 127, .35);
  background: #262626; color: #ededed;
  box-shadow: 0 16px 48px rgba(0, 0, 0, .45); font-size: 13px; line-height: 20px;
}
[${ATTR}="dialogTitle"] { margin-bottom: 10px; font-weight: 500; }
[${ATTR}="dialogInput"] {
  width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 8px;
  border: 1px solid rgba(127, 127, 127, .45);
  background: #1b1b1b; color: inherit; font: inherit; font-size: 13px;
}
[${ATTR}="dialogActions"] { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
[${ATTR}="dialog"][data-variant="manager"] { width: min(560px, calc(100vw - 32px)); max-height: min(70vh, 640px); display: flex; flex-direction: column; }
[${ATTR}="managerList"] { overflow-y: auto; margin: 4px 0 10px; padding-right: 4px; display: flex; flex-direction: column; gap: 4px; }
[${ATTR}="managerHint"] { padding: 6px 2px; opacity: .65; font-size: 12px; }
[${ATTR}="managerItem"] { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 4px 2px; border-bottom: 1px solid rgba(127, 127, 127, .18); }
[${ATTR}="managerName"] { flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[${ATTR}="managerCount"] { flex: none; opacity: .6; font-size: 11px; }
[${ATTR}="managerAdd"] { display: flex; gap: 8px; align-items: center; }
[${ATTR}="managerAdd"] [${ATTR}="dialogInput"] { flex: 1; }
[${ATTR}="dialogButton"][data-active="true"] { background: rgba(90, 150, 255, .28); border-color: rgba(90, 150, 255, .6); }
[${ATTR}="dialogButton"] {
  min-width: 64px; padding: 0 10px; height: 28px; border-radius: 8px; cursor: pointer;
  border: 1px solid rgba(127, 127, 127, .45);
  background: transparent; color: inherit; font: inherit; font-size: 12px;
}
[${ATTR}="dialogButton"]:hover { background: rgba(255, 255, 255, .12); }
[${ATTR}="dialogButton"][data-tone="danger"] { color: #ff8f8f; }
[${ATTR}="toast"] {
  position: fixed; z-index: 2147483002; left: 50%; bottom: 32px; transform: translateX(-50%);
  padding: 6px 12px; border-radius: 999px; font-size: 12px; line-height: 18px;
  background: #262626; color: #ededed; border: 1px solid rgba(127, 127, 127, .4);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .45);
}
`
      document.head.appendChild(style)
    }

    // ------------------------------------------------------------------- apply

    const CHEVRON =
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6.5 8 10l4-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

    function apply(ctx) {
      const workspaces = ctx.get('workspaces')
      if (workspaces === undefined) {
        console.warn(`[${NS}] workspaces 服务不可用，插件未启用`)
        return
      }
      if (window.localStorage.getItem(OFF_KEY) === '1') {
        console.info(`[${NS}] 已被 ${OFF_KEY} 关闭；清掉该键并重启即可恢复`)
        return
      }

      let state = readState()
      let syncing = false
      let disabled = false
      /** Group id whose header is being dragged for reordering, or null. */
      let draggedGroup = null
      /** Set by a header dragstart so the following dragend knows it was ours. */
      let headerDragStarted = false
      /** Last signature applied per tree container, so unchanged trees are left alone. */
      const appliedSignature = new WeakMap()
      /** label → workspaceId, refreshed from the reactive workspace projection. */
      const idByLabel = new Map()

      function workspaceItems() {
        try {
          const snapshot = workspaces.list.getSnapshot()
          return Array.isArray(snapshot?.items) ? snapshot.items : []
        } catch {
          return []
        }
      }

      function refreshLabels() {
        idByLabel.clear()
        for (const item of workspaceItems()) {
          if (typeof item?.title === 'string' && typeof item?.workspaceId === 'string') {
            idByLabel.set(item.title, item.workspaceId)
          }
        }
      }

      // ------------------------------------------------------- DOM contract

      /**
       * One workspace section: a direct child of the tree that wraps a workspace
       * (the folder row, plus that workspace's session rows when expanded).
       *
       * This is deliberately structural only. An earlier revision also required
       * the section to NOT carry a `treeitem` role, which silently matched zero
       * sections whenever the official wrapper happens to expose that role — and
       * zero sections means no grouping at all.
       */
      function looksLikeSection(node, tree) {
        if (node.getAttribute?.(ATTR) === 'header' || node.getAttribute?.(ATTR) === 'divider') return false
        if (node.parentElement !== tree) return false
        return node.querySelector?.('[role="treeitem"]') !== null
      }

      /** Sections of a tree, honouring this plugin's own marker and its children's. */
      function sectionsOf(tree) {
        return [...tree.children].filter(
          (child) =>
            child.getAttribute?.(ATTR) === 'section' ||
            (child.getAttribute?.(ATTR) !== 'header' &&
              child.getAttribute?.(ATTR) !== 'divider' &&
              looksLikeSection(child, tree)),
        )
      }

      /** Every `[role="tree"]` that currently lists workspaces. */
      function treeContainers() {
        const containers = []
        for (const tree of document.querySelectorAll('[role="tree"]')) {
          if (tree.getAttribute?.(ATTR) === 'tree') {
            containers.push(tree)
            continue
          }
          if (sectionsOf(tree).length > 0) containers.push(tree)
        }
        return containers
      }

      /** The workspace section owning a node, or null. Never mutates the DOM. */
      function sectionOf(node) {
        let walk = node ?? null
        let guard = 0
        while (walk !== null && walk !== undefined && guard < 30) {
          guard += 1
          if (walk.getAttribute?.(ATTR) === 'section') return walk
          const parent = walk.parentElement ?? null
          if (parent?.getAttribute?.('role') === 'tree') {
            return looksLikeSection(walk, parent) ? walk : null
          }
          walk = parent
        }
        return null
      }

      /**
       * The workspace label rendered by the section's folder row.
       *
       * The row is `span.slot(icon) + span.slot(arrow) + span.projectText >
       * span.title(label) + span.rowActions`, so a bare `querySelector('span')`
       * can land on an icon slot and yield an empty string. Prefer explicit
       * attribute hooks, then the deepest leaf span that actually has text.
       */
      function sectionLabel(section) {
        const row = section.querySelector?.('[role="treeitem"]') ?? null
        if (row === null) return ''
        const explicit =
          row.querySelector?.('[class*="projectText"] [class*="title"]') ??
          row.querySelector?.('[class*="projectText"]') ??
          null
        const explicitText = (explicit?.textContent ?? '').trim()
        if (explicitText !== '') return explicitText.slice(0, 80)
        for (const span of row.querySelectorAll?.('span') ?? []) {
          const text = (span.textContent ?? '').trim()
          if (text !== '' && span.querySelector?.('span') === null) return text.slice(0, 80)
        }
        const fallback = (row.textContent ?? '').trim()
        return fallback.slice(0, 80)
      }

      /**
       * Stable identity for a workspace section.
       *
       * The authoritative key is the Host `workspaceId`: sections render in the
       * same order as the workspace projection (`workspaceIds`), so the title
       * lookup is tried first and the positional projection is the fallback.
       * Only when the projection is unreadable does this degrade to the title
       * itself.
       */
      function keyOf(section, index) {
        const label = sectionLabel(section)
        if (label !== '') {
          const byTitle = idByLabel.get(label)
          if (byTitle !== undefined) return byTitle
        }
        const items = workspaceItems()
        const positional = items[index]
        if (typeof positional?.workspaceId === 'string' && positional.workspaceId !== '') {
          return positional.workspaceId
        }
        return label === '' ? `ix:${index}` : `label:${label}`
      }

      function labelOf(key) {
        if (key.startsWith('label:')) return key.slice('label:'.length)
        const item = workspaceItems().find((candidate) => candidate.workspaceId === key)
        if (item?.title !== undefined) return item.title
        const section = document.querySelector(`[${ATTR}Key="${CSS.escape(key)}"]`)
        return section?.getAttribute?.(`${ATTR}Label`) ?? key
      }

      /** Remove every node this plugin added; React-owned nodes are untouched. */
      function clearAdded(container) {
        for (const node of container.querySelectorAll(`[${ATTR}="header"], [${ATTR}="divider"]`)) node.remove()
        container.removeAttribute(ATTR)
        container.style.removeProperty('display')
        container.style.removeProperty('flex-direction')
        for (const section of container.children) {
          if (section.getAttribute?.(ATTR) === 'section') {
            section.style.removeProperty('order')
            section.style.removeProperty('display')
          }
        }
      }

      /** Immediate, reversible-stop: drop every decoration and stop syncing. */
      function undecorate() {
        disabled = true
        window.__dshWgOff = true
        for (const container of document.querySelectorAll(`[${ATTR}="tree"]`)) clearAdded(container)
        for (const node of document.querySelectorAll(`[${ATTR}="bar"]`)) node.remove()
        diag('disabled', {})
      }

      /** Re-enable after `undecorate()`; used by the console helper. */
      function redecorate() {
        disabled = false
        window.__dshWgOff = false
        appliedSignature.clear?.()
        ensureStyles()
        ensureBar()
        sync()
        diag('enabled', {})
      }

      /**
       * Bring the DOM in line with the stored grouping: headers (re)created,
       * sections ordered by `order`, collapsed sections hidden.
       */
      function sync() {
        if (syncing || disabled || window.__dshWgOff === true) return
        syncing = true
        try {
          refreshLabels()
          for (const container of treeContainers()) {
            const sections = sectionsOf(container)
            if (sections.length === 0) {
              clearAdded(container)
              continue
            }
            const signature = JSON.stringify([
              sections.map((_section, index) => {
                const item = workspaceItems()[index]
                return typeof item?.workspaceId === 'string' ? item.workspaceId : `#${index}`
              }),
              state.groups.map((group) => [group.id, group.name, group.workspaces]),
              state.collapsed,
            ])
            if (
              appliedSignature.get(container) === signature &&
              container.querySelector(`[${ATTR}="header"]`) !== null
            ) {
              continue
            }
            clearAdded(container)
            container.setAttribute(ATTR, 'tree')

            const byGroup = new Map()
            const ungrouped = []
            let order = 0
            for (const [index, section] of sections.entries()) {
              section.setAttribute(ATTR, 'section')
              const key = keyOf(section, index)
              section.setAttribute(`${ATTR}Key`, key)
              section.setAttribute(`${ATTR}Label`, sectionLabel(section) || `#${index}`)
              const group = groupOf(state, key)
              if (group === undefined) ungrouped.push(section)
              else {
                if (!byGroup.has(group.id)) byGroup.set(group.id, [])
                byGroup.get(group.id).push(section)
              }
            }

            const renderHeader = (groupId, name, members, collapsible, empty) => {
              const collapsed = collapsible && state.collapsed.includes(groupId)
              const header = document.createElement('div')
              header.setAttribute(ATTR, 'header')
              header.setAttribute(`${ATTR}Group`, groupId)
              header.setAttribute('data-collapsed', String(collapsed))
              header.setAttribute('role', 'button')
              header.setAttribute('tabindex', '0')
              header.setAttribute('aria-expanded', String(!collapsed))
              header.setAttribute('draggable', 'true')
              header.title = '拖动可调整分组顺序'
              header.innerHTML =
                `<span ${ATTR}="chevron">${CHEVRON}</span>` +
                `<span ${ATTR}="name"></span>` +
                `<span ${ATTR}="count"></span>` +
                `<button ${ATTR}="actions" type="button" aria-label="分组操作">⋯</button>`
              header.querySelector(`[${ATTR}="name"]`).textContent = name
              header.querySelector(`[${ATTR}="count"]`).textContent = empty ? '空' : String(members.length)
              header.style.order = String(order++)
              container.insertBefore(header, members[0] ?? null)
              for (const section of members) {
                section.style.order = String(order++)
                if (collapsed) section.style.display = 'none'
              }
            }

            // Empty groups are rendered too: a freshly created group must be
            // visible, otherwise "新建分组" looks like it did nothing.
            for (const group of state.groups) {
              const members = byGroup.get(group.id) ?? []
              renderHeader(group.id, group.name, members, true, members.length === 0)
            }

            if (ungrouped.length > 0 && state.groups.length > 0) {
              const divider = document.createElement('div')
              divider.setAttribute(ATTR, 'divider')
              divider.style.order = String(order++)
              container.insertBefore(divider, ungrouped[0])
            }
            if (ungrouped.length > 0) {
              renderHeader(UNGROUPED, UNGROUPED_NAME, ungrouped, true, false)
            } else if (state.groups.length === 0) {
              renderHeader(UNGROUPED, UNGROUPED_NAME, ungrouped, true, true)
            }

            appliedSignature.set(container, signature)
            diag('sync', {
              sections: sections.map((section) => section.getAttribute(`${ATTR}Key`)),
              groups: state.groups.map((group) => `${group.name}:${group.workspaces.length}`),
            })
          }
        } catch (error) {
          diag('sync-failed', String(error))
          console.warn(`[${NS}] 分组渲染失败（会在下次 DOM 变化时重试）：`, error)
        } finally {
          syncing = false
        }
      }

      function save() {
        writeState(state)
        appliedSignature.clear?.()
        sync()
      }

      // --------------------------------------------------------------- dialog

      let openDialog = null

      function closeDialog() {
        if (openDialog !== null) {
          openDialog.remove()
          openDialog = null
        }
      }

      /** Transient centered notice; also used for clipboard feedback. */
      function toast(message) {
        const note = document.createElement('div')
        note.setAttribute(ATTR, 'toast')
        note.textContent = message
        document.body.appendChild(note)
        setTimeout(() => note.remove(), 2200)
      }

      /**
       * In-page text/confirm dialog.
       *
       * `window.prompt` and `window.confirm` are unreliable inside the packaged
       * Electron shell (a prompt can return `null` without ever showing), so the
       * plugin owns its input surface.
       */
      function askDialog({ title, initial = '', confirmLabel = '确定', tone, onConfirm }) {
        closeDialog()
        const overlay = document.createElement('div')
        overlay.setAttribute(ATTR, 'overlay')
        const box = document.createElement('div')
        box.setAttribute(ATTR, 'dialog')
        const heading = document.createElement('div')
        heading.setAttribute(ATTR, 'dialogTitle')
        heading.textContent = title
        const input = document.createElement('input')
        input.setAttribute(ATTR, 'dialogInput')
        input.type = 'text'
        input.value = initial
        const actions = document.createElement('div')
        actions.setAttribute(ATTR, 'dialogActions')
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.setAttribute(ATTR, 'dialogButton')
        cancel.textContent = '取消'
        const ok = document.createElement('button')
        ok.type = 'button'
        ok.setAttribute(ATTR, 'dialogButton')
        if (tone !== undefined) ok.setAttribute('data-tone', tone)
        ok.textContent = confirmLabel
        actions.append(cancel, ok)
        box.append(heading, input, actions)
        overlay.appendChild(box)
        document.body.appendChild(overlay)
        openDialog = overlay
        input.focus()
        input.select()
        const settle = (value) => {
          closeDialog()
          if (value !== undefined) onConfirm(value)
        }
        cancel.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          settle(undefined)
        })
        ok.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          settle(input.value.trim())
        })
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) settle(undefined)
        })
        input.addEventListener('keydown', (event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            settle(input.value.trim())
          } else if (event.key === 'Escape') {
            event.preventDefault()
            settle(undefined)
          }
        })
        diag('dialog-open', { title })
      }

      /**
       * The full group manager.
       *
       * This is the primary, unmissable entry point: every workspace is listed
       * with one checkbox per group, so a freshly created group can be filled
       * with a click instead of a drag. Workspaces are exclusive (they belong to
       * at most one group), so checking one box clears that workspace's other
       * boxes immediately.
       */
      function openGroupManager() {
        closeDialog()
        refreshLabels()
        const workspaceKeys = workspaceItems()
          .map((item) => (typeof item?.workspaceId === 'string' ? item.workspaceId : null))
          .filter((key) => key !== null)
        const overlay = document.createElement('div')
        overlay.setAttribute(ATTR, 'overlay')
        const box = document.createElement('div')
        box.setAttribute(ATTR, 'dialog')
        box.setAttribute('data-variant', 'manager')

        const heading = document.createElement('div')
        heading.setAttribute(ATTR, 'dialogTitle')
        heading.textContent = '管理工作区分组'

        const list = document.createElement('div')
        list.setAttribute(ATTR, 'managerList')

        const addRow = document.createElement('div')
        addRow.setAttribute(ATTR, 'managerAdd')
        const nameInput = document.createElement('input')
        nameInput.setAttribute(ATTR, 'dialogInput')
        nameInput.type = 'text'
        nameInput.placeholder = '新分组名称'
        const addButton = document.createElement('button')
        addButton.type = 'button'
        addButton.setAttribute(ATTR, 'dialogButton')
        addButton.textContent = '新建分组'
        addRow.append(nameInput, addButton)

        const actions = document.createElement('div')
        actions.setAttribute(ATTR, 'dialogActions')
        const close = document.createElement('button')
        close.type = 'button'
        close.setAttribute(ATTR, 'dialogButton')
        close.textContent = '关闭'
        actions.appendChild(close)

        box.append(heading, list, addRow, actions)
        overlay.appendChild(box)
        document.body.appendChild(overlay)
        openDialog = overlay

        const renderBody = () => {
          list.textContent = ''
          if (state.groups.length === 0 && workspaceKeys.length === 0) {
            const empty = document.createElement('div')
            empty.setAttribute(ATTR, 'managerHint')
            empty.textContent = '尚未发现工作区。'
            list.appendChild(empty)
            return
          }
          if (state.groups.length === 0) {
            const hint = document.createElement('div')
            hint.setAttribute(ATTR, 'managerHint')
            hint.textContent = '还没有分组。在下方输入名称并点「新建分组」。'
            list.appendChild(hint)
          }
          for (const group of state.groups) {
            const item = document.createElement('div')
            item.setAttribute(ATTR, 'managerItem')
            const name = document.createElement('span')
            name.setAttribute(ATTR, 'managerName')
            name.textContent = group.name
            const count = document.createElement('span')
            count.setAttribute(ATTR, 'managerCount')
            count.textContent = group.workspaces.length === 0 ? '空' : `${group.workspaces.length} 个`
            const rename = document.createElement('button')
            rename.type = 'button'
            rename.setAttribute(ATTR, 'dialogButton')
            rename.textContent = '重命名'
            rename.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              askDialog({
                title: `重命名分组：${group.name}`,
                initial: group.name,
                onConfirm: (value) => {
                  if (value !== '') {
                    group.name = value
                    diag('rename-group', { groupId: group.id, name: value })
                    save()
                  }
                  openGroupManager()
                },
              })
            })
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.setAttribute(ATTR, 'dialogButton')
            remove.setAttribute('data-tone', 'danger')
            remove.textContent = '删除分组'
            remove.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              state.groups = state.groups.filter((candidate) => candidate.id !== group.id)
              state.collapsed = state.collapsed.filter((id) => id !== group.id)
              diag('delete-group', { groupId: group.id })
              save()
              renderBody()
            })
            item.append(name, count, rename, remove)
            list.appendChild(item)
          }

          const workspaceHeading = document.createElement('div')
          workspaceHeading.setAttribute(ATTR, 'managerHint')
          workspaceHeading.textContent = '勾选工作区放入分组（每个工作区只属于一个分组）：'
          list.appendChild(workspaceHeading)

          for (const key of workspaceKeys) {
            const item = document.createElement('div')
            item.setAttribute(ATTR, 'managerItem')
            const name = document.createElement('span')
            name.setAttribute(ATTR, 'managerName')
            name.textContent = labelOf(key)
            item.appendChild(name)
            const current = groupOf(state, key)
            const ungrouped = document.createElement('button')
            ungrouped.type = 'button'
            ungrouped.setAttribute(ATTR, 'dialogButton')
            if (current === undefined) ungrouped.setAttribute('data-active', 'true')
            ungrouped.textContent = UNGROUPED_NAME
            ungrouped.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              place(state, key, undefined)
              diag('manager-ungroup', { key })
              save()
              renderBody()
            })
            item.appendChild(ungrouped)
            for (const group of state.groups) {
              const toggle = document.createElement('button')
              toggle.type = 'button'
              toggle.setAttribute(ATTR, 'dialogButton')
              if (current?.id === group.id) toggle.setAttribute('data-active', 'true')
              toggle.textContent = group.name
              toggle.addEventListener('click', (event) => {
                event.preventDefault()
                event.stopPropagation()
                const active = groupOf(state, key)?.id === group.id
                place(state, key, active ? undefined : group.id)
                diag('manager-assign', { key, group: active ? null : group.id })
                save()
                renderBody()
              })
              item.appendChild(toggle)
            }
            list.appendChild(item)
          }
        }

        const addGroup = () => {
          const name = nameInput.value.trim()
          if (name === '') return
          state.groups.push({ id: `g${Date.now().toString(36)}`, name, workspaces: [] })
          nameInput.value = ''
          diag('new-group', { name, total: state.groups.length })
          save()
          renderBody()
          nameInput.focus()
        }
        addButton.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          addGroup()
        })
        nameInput.addEventListener('keydown', (event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            addGroup()
          }
        })
        close.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          closeDialog()
        })
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) closeDialog()
        })

        renderBody()
        nameInput.focus()
        diag('manager-open', { groups: state.groups.length, workspaces: workspaceKeys.length })
      }

      function promptForText(title, initial, run) {
        askDialog({ title, initial, onConfirm: run })
      }

      // ---------------------------------------------------------------- menus

      let openMenu = null

      function closeMenu() {
        if (openMenu !== null) {
          openMenu.remove()
          openMenu = null
        }
      }

      function showMenu(anchor, entries) {
        closeMenu()
        const menu = document.createElement('div')
        menu.setAttribute(ATTR, 'menu')
        for (const entry of entries) {
          if (entry === null) {
            const separator = document.createElement('div')
            separator.setAttribute(ATTR, 'menuSep')
            menu.appendChild(separator)
            continue
          }
          if (entry.title === true) {
            const title = document.createElement('div')
            title.setAttribute(ATTR, 'menuTitle')
            title.textContent = entry.label
            menu.appendChild(title)
            continue
          }
          const item = document.createElement('button')
          item.type = 'button'
          item.setAttribute(ATTR, 'menuItem')
          if (entry.tone !== undefined) item.setAttribute('data-tone', entry.tone)
          item.textContent = entry.label
          item.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
            entry.run()
          })
          menu.appendChild(item)
        }
        document.body.appendChild(menu)
        openMenu = menu
        const rect = anchor?.getBoundingClientRect?.() ?? { left: 24, top: 24, bottom: 24 }
        const width = menu.offsetWidth
        const height = menu.offsetHeight
        menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
        menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - height - 8)}px`
      }

      // ----------------------------------------------------------- mutations

      function newGroup(seedKey) {
        promptForText('新建分组', '新分组', (name) => {
          if (name === '') {
            diag('new-group-empty', {})
            return
          }
          const group = { id: `g${Date.now().toString(36)}`, name, workspaces: [] }
          state.groups.push(group)
          if (typeof seedKey === 'string' && seedKey !== '') place(state, seedKey, group.id)
          diag('new-group', { name, id: group.id, seed: seedKey ?? null, total: state.groups.length })
          save()
        })
      }

      function renameGroup(groupId) {
        const group = state.groups.find((candidate) => candidate.id === groupId)
        if (group === undefined) return
        promptForText('重命名分组', group.name, (name) => {
          if (name === '') return
          group.name = name
          diag('rename-group', { groupId, name })
          save()
        })
      }

      function moveTo(key, groupId) {
        const before = groupOf(state, key)?.name ?? UNGROUPED_NAME
        place(state, key, groupId === '' ? undefined : groupId)
        diag('move', {
          key,
          from: before,
          to: groupId === UNGROUPED ? UNGROUPED_NAME : groupOf(state, key)?.name ?? groupId,
        })
        save()
      }

      function toggleCollapsed(groupId, collapsible = true) {
        if (!collapsible) return
        state.collapsed = state.collapsed.includes(groupId)
          ? state.collapsed.filter((id) => id !== groupId)
          : [...state.collapsed, groupId]
        diag('toggle', { groupId, collapsed: state.collapsed.includes(groupId) })
        save()
      }

      /**
       * Move one group to a new position in the stored order. `beforeGroupId`
       * names the anchor the group lands in front of; `undefined` appends, and
       * the ungrouped pseudo-group always trails the real list.
       */
      function reorderGroup(groupId, beforeGroupId) {
        if (groupId === UNGROUPED) return
        const moved = state.groups.find((group) => group.id === groupId)
        if (moved === undefined) return
        const without = state.groups.filter((group) => group.id !== groupId)
        const found = beforeGroupId === undefined || beforeGroupId === UNGROUPED
          ? -1
          : without.findIndex((group) => group.id === beforeGroupId)
        const at = found === -1 ? without.length : found
        const next = [...without.slice(0, at), moved, ...without.slice(at)]
        if (next.every((group, index) => group.id === state.groups[index]?.id)) return
        state.groups = next
        diag('reorder-group', {
          groupId,
          before: beforeGroupId ?? '(末尾)',
          order: next.map((group) => group.name),
        })
        save()
      }

      function workspaceMenu(anchor, key) {
        const entries = [{ label: `“${labelOf(key)}” 移入分组`, title: true }]
        for (const group of state.groups) {
          const active = group.workspaces.includes(key)
          entries.push({ label: `${active ? '✓ ' : ''}${group.name}`, run: () => moveTo(key, group.id) })
        }
        entries.push(null)
        entries.push({ label: `移出分组（${UNGROUPED_NAME}）`, run: () => moveTo(key, UNGROUPED) })
        entries.push({ label: '新建分组…', run: () => newGroup(key) })
        showMenu(anchor, entries)
      }

      function groupMenu(anchor, groupId) {
        const collapsed = state.collapsed.includes(groupId)
        if (groupId === UNGROUPED) {
          // The ungrouped bucket is not a stored group: it can be folded, but it
          // cannot be renamed, moved to the front, or deleted.
          showMenu(anchor, [
            {
              label: collapsed ? '展开未分组' : '折叠未分组',
              run: () => toggleCollapsed(UNGROUPED),
            },
            {
              label: '新建分组…',
              run: () => newGroup(undefined),
            },
            null,
            { label: '管理分组…', run: () => openGroupManager() },
          ])
          return
        }
        const group = state.groups.find((candidate) => candidate.id === groupId)
        if (group === undefined) return
        showMenu(anchor, [
          {
            label: '重命名分组…',
            run: () => renameGroup(groupId),
          },
          {
            label: group.workspaces.length > 0 ? `全部移出（${group.workspaces.length} 个）` : '全部移出',
            run: () => {
              group.workspaces = []
              save()
            },
          },
          {
            label: collapsed ? '展开分组' : '折叠分组',
            run: () => toggleCollapsed(group.id),
          },
          null,
          {
            label: '删除分组',
            tone: 'danger',
            run: () => {
              state.groups = state.groups.filter((candidate) => candidate.id !== groupId)
              state.collapsed = state.collapsed.filter((id) => id !== groupId)
              save()
            },
          },
        ])
      }

      // --------------------------------------------------------- interaction

      /** Which half of a drop anchor the cursor is in. */
      function halfOf(event, anchor) {
        const rect = anchor.getBoundingClientRect()
        return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      }

      /** The header's own half is only meaningful for group reordering. */
      function groupHalf(event, anchor) {
        return halfOf(event, anchor)
      }

      /**
       * Complete one group reorder. Dropping before/after a real group moves
       * that group there; dropping on the ungrouped bucket (or on empty space)
       * moves it to the end, because ungrouped always trails the list.
       */
      function applyGroupDrop(groupId, targetGroupId, half) {
        if (targetGroupId === UNGROUPED || targetGroupId === undefined) {
          reorderGroup(groupId, undefined)
          return
        }
        if (groupId === targetGroupId) return
        const order = state.groups.map((group) => group.id)
        const targetIndex = order.indexOf(targetGroupId)
        if (targetIndex === -1) return
        const before = half === 'after'
          ? state.groups[targetIndex + 1]?.id
          : targetGroupId
        reorderGroup(groupId, before)
      }

      /** Where a drop lands: a header directly, or the group of the row's section. */
      function dropTargetOf(node) {
        const header = node?.closest?.(`[${ATTR}="header"]`) ?? null
        if (header !== null) return { anchor: header, groupId: header.getAttribute(`${ATTR}Group`) ?? '' }
        const section = sectionOf(node)
        if (section === null) return null
        const key = section.getAttribute(`${ATTR}Key`)
        if (typeof key !== 'string' || key === '') return null
        return { anchor: section, groupId: groupOf(state, key)?.id ?? '' }
      }

      /**
       * The dragged workspace key, read from the payload the official folder row
       * wrote in its own `dragstart`
       * (`dataTransfer.setData('text/plain', row.key)`). Reading the payload
       * instead of tracking drag state keeps this module out of React's drag
       * lifecycle, so intra-group reordering stays untouched.
       */
      function draggedKeyFrom(event) {
        try {
          const text = event.dataTransfer?.getData?.('text/plain') ?? ''
          return text === '' ? null : text
        } catch {
          return null
        }
      }

      /**
       * Group reordering starts on one of this plugin's own headers. The header
       * is marked `draggable` and the drag carries a dedicated MIME type, so a
       * header drag can never be confused with an official workspace-row drag
       * (which writes `text/plain`).
       */
      const onGroupDragStart = (event) => {
        const header = event.target?.closest?.(`[${ATTR}="header"]`) ?? null
        if (header === null || typeof event.dataTransfer?.setData !== 'function') return
        const groupId = header.getAttribute(`${ATTR}Group`) ?? ''
        draggedGroup = groupId
        headerDragStarted = true
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(GROUP_MIME, groupId)
        diag('group-drag-start', { groupId })
      }

      const onGroupDragEnd = () => {
        if (!headerDragStarted) return
        headerDragStarted = false
        diag('group-drag-end', { draggedGroup })
        draggedGroup = null
        for (const node of document.querySelectorAll(`[${ATTR}="header"][data-drop]`)) {
          node.removeAttribute('data-drop')
        }
      }

      const onContextMenu = (event) => {
        const header = event.target?.closest?.(`[${ATTR}="header"]`) ?? null
        if (header !== null) {
          event.preventDefault()
          event.stopPropagation()
          groupMenu(header, header.getAttribute(`${ATTR}Group`) ?? '')
          return
        }
        const section = sectionOf(event.target)
        if (section === null) return
        const key = section.getAttribute(`${ATTR}Key`)
        if (typeof key !== 'string' || key === '') return
        event.preventDefault()
        event.stopPropagation()
        diag('workspace-menu', { key })
        workspaceMenu(section, key)
      }

      /**
       * A drop on the empty area below the last group moves that group to the
       * end. Only group drags are considered, so the official list keeps owning
       * every other drop.
       */
      function onDragOverContainer(event) {
        if (draggedGroup === null || !event.target?.matches?.(`[${ATTR}="tree"]`)) return
        event.preventDefault()
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
      }

      const onDropContainer = (event) => {
        if (draggedGroup === null || !event.target?.matches?.(`[${ATTR}="tree"]`)) return
        event.preventDefault()
        event.stopPropagation()
        reorderGroup(draggedGroup, undefined)
        draggedGroup = null
      }

      const onDragOver = (event) => {
        const target = dropTargetOf(event.target)
        if (target === null) return
        event.preventDefault()
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
        target.anchor.setAttribute(
          'data-drop',
          draggedGroup === null ? 'active' : groupHalf(event, target.anchor),
        )
      }

      const onDragLeave = (event) => {
        const target = dropTargetOf(event.target)
        if (target === null) return
        target.anchor.removeAttribute('data-drop')
      }

      const onDrop = (event) => {
        const target = dropTargetOf(event.target)
        if (target === null) return
        target.anchor.removeAttribute('data-drop')
        // Group reordering: the dragged header is dropped before or after the
        // group under the cursor.
        if (draggedGroup !== null) {
          event.preventDefault()
          event.stopPropagation()
          const half = groupHalf(event, target.anchor)
          applyGroupDrop(draggedGroup, target.groupId, half)
          draggedGroup = null
          return
        }
        const key = draggedKeyFrom(event)
        diag('drop', { key, groupId: target.groupId, anchor: target.anchor.getAttribute(ATTR) })
        if (key === null) return
        // Only take the drop over when it actually changes the group; otherwise
        // the official row/list reorder keeps working untouched.
        const current = groupOf(state, key)?.id ?? ''
        if (current === target.groupId) return
        event.preventDefault()
        event.stopPropagation()
        moveTo(key, target.groupId)
      }

      const onClick = (event) => {
        const target = event.target
        if (typeof target?.closest !== 'function') return
        if (openMenu !== null && target.closest(`[${ATTR}="menu"]`) === null) closeMenu()
        if (disabled || window.__dshWgOff === true) return

        const actions = target.closest(`[${ATTR}="actions"]`)
        if (actions !== null) {
          event.preventDefault()
          event.stopPropagation()
          groupMenu(actions, actions.closest(`[${ATTR}="header"]`)?.getAttribute(`${ATTR}Group`) ?? '')
          return
        }
        const header = target.closest(`[${ATTR}="header"]`)
        if (header !== null) {
          event.preventDefault()
          event.stopPropagation()
          toggleCollapsed(header.getAttribute(`${ATTR}Group`) ?? '')
        }
      }

      const onDoubleClick = (event) => {
        const header = event.target?.closest?.(`[${ATTR}="header"]`) ?? null
        if (header === null) return
        const groupId = header.getAttribute(`${ATTR}Group`)
        const group = state.groups.find((candidate) => candidate.id === groupId)
        if (group === undefined) return
        event.preventDefault()
        event.stopPropagation()
        renameGroup(groupId)
      }

      const onKeyDown = (event) => {
        const header = event.target
        if (header === null || header === undefined || header.getAttribute?.(ATTR) !== 'header') return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleCollapsed(header.getAttribute(`${ATTR}Group`) ?? '')
        }
      }

      // ------------------------------------------------------------------ bar

      const BAR_ACTIONS = [
        { label: '管理分组…', run: () => openGroupManager() },
        { label: '新建分组…', run: () => newGroup(undefined) },
        {
          label: '折叠全部',
          run: () => {
            state.collapsed = state.groups.map((group) => group.id)
            save()
          },
        },
        {
          label: '展开全部',
          run: () => {
            state.collapsed = []
            save()
          },
        },
        { label: '刷新分组', run: () => sync() },
        {
          label: '复制诊断信息到剪贴板',
          run: () => {
            const report = JSON.stringify(diagnose(), null, 2)
            navigator.clipboard?.writeText?.(report).then(
              () => toast('诊断信息已复制，粘贴给开发者即可'),
              () => toast('复制失败：请在控制台执行 window.__dshWgDiagnose()'),
            )
          },
        },
        null,
        { label: '停用分组显示（本次会话）', tone: 'danger', run: () => undecorate() },
      ]

      const barBodies = new WeakSet()

      function ensureBar() {
        if (disabled || window.__dshWgOff === true) return
        for (const container of treeContainers()) {
          const body = container.parentElement
          if (body === null || barBodies.has(body)) continue
          if ([...body.children].some((child) => child.getAttribute?.(ATTR) === 'bar')) {
            barBodies.add(body)
            continue
          }
          const bar = document.createElement('div')
          bar.setAttribute(ATTR, 'bar')
          const manager = document.createElement('button')
          manager.type = 'button'
          manager.setAttribute(ATTR, 'barPrimary')
          manager.textContent = '管理分组'
          manager.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            openGroupManager()
          })
          const more = document.createElement('button')
          more.type = 'button'
          more.setAttribute(ATTR, 'barButton')
          more.textContent = '⋯'
          more.setAttribute('aria-label', '分组选项')
          more.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            showMenu(more, BAR_ACTIONS)
          })
          bar.append(manager, more)
          body.insertBefore(bar, container)
          barBodies.add(body)
        }
      }

      const observer = new MutationObserver(() => {
        if (syncing) return
        ensureBar()
        sync()
      })

      /** Snapshot for the console. */
      function diagnose() {
        const containers = treeContainers()
        const probe = (node) => {
          if (node === null || node === undefined) return null
          const style = window.getComputedStyle(node)
          return {
            tag: node.tagName,
            role: node.getAttribute?.('role') ?? null,
            color: style.color,
            background: style.backgroundColor,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily.slice(0, 40),
            text: (node.textContent ?? '').trim().slice(0, 40),
          }
        }
        const report = {
          mounted: true,
          off: window.__dshWgOff === true,
          containers: containers.length,
          groups: state.groups,
          collapsed: state.collapsed,
          ui: {
            headers: [...document.querySelectorAll(`[${ATTR}="header"]`)].map((header) => ({
              group: header.getAttribute(`${ATTR}Group`),
              name: header.querySelector(`[${ATTR}="name"]`)?.textContent ?? '',
              count: header.querySelector(`[${ATTR}="count"]`)?.textContent ?? '',
              order: header.style.order || '(none)',
              visible: header.getBoundingClientRect().height > 0,
            })),
            bar: document.querySelector(`[${ATTR}="bar"]`) !== null,
          },
          sections: [],
          style: {
            theme: document.documentElement.dataset.theme ?? '(unset)',
            header: probe(document.querySelector(`[${ATTR}="header"]`)),
            folderRow: probe(containers[0]?.querySelector('[role="treeitem"]') ?? null),
            list: probe(containers[0] ?? null),
          },
        }
        for (const container of containers) {
          report.sections = sectionsOf(container).map((section) => ({
            key: section.getAttribute(`${ATTR}Key`) ?? null,
            label: sectionLabel(section),
            owner: groupOf(state, section.getAttribute(`${ATTR}Key`) ?? '')?.name ?? UNGROUPED_NAME,
            order: section.style.order || '(none)',
            display: section.style.display || 'shown',
          }))
        }
        report.log = DIAG.slice(-25)
        console.info(`[${NS}] diagnose()`, report)
        return report
      }

      ctx.effect(() => {
        document.addEventListener('click', onClick, true)
        document.addEventListener('dblclick', onDoubleClick, true)
        document.addEventListener('contextmenu', onContextMenu, true)
        document.addEventListener('dragover', onDragOver, true)
        document.addEventListener('dragleave', onDragLeave, true)
        document.addEventListener('drop', onDrop, true)
        document.addEventListener('keydown', onKeyDown, true)
        document.addEventListener('dragstart', onGroupDragStart, true)
        document.addEventListener('dragend', onGroupDragEnd, true)
        document.addEventListener('dragover', onDragOverContainer, false)
        document.addEventListener('drop', onDropContainer, false)
        let unsubscribe
        try {
          unsubscribe = workspaces.list?.subscribe?.(() => sync())
        } catch (error) {
          diag('subscribe-failed', String(error))
        }
        ensureStyles()
        ensureBar()
        sync()
        observer.observe(document.body, { childList: true, subtree: true })
        window.__dshWgDiagnose = diagnose
        window.__dshWgOn = () => {
          redecorate()
          return 'dsh-workspace-groups: 已重新启用'
        }
        window.__dshWgOff = false
        diag('mounted', {
          containers: treeContainers().length,
          workspaces: workspaceItems().map((item) => item.workspaceId),
          stored: window.localStorage.getItem(STORAGE_KEY),
        })
        console.info(
          `[${NS}] 已启用；诊断 window.__dshWgDiagnose()；停用 window.__dshWgOff = true；重新启用 window.__dshWgOn()`,
        )
        return () => {
          observer.disconnect()
          unsubscribe?.()
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('dblclick', onDoubleClick, true)
          document.removeEventListener('contextmenu', onContextMenu, true)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('dragleave', onDragLeave, true)
          document.removeEventListener('drop', onDrop, true)
          document.removeEventListener('keydown', onKeyDown, true)
          document.removeEventListener('dragstart', onGroupDragStart, true)
          document.removeEventListener('dragend', onGroupDragEnd, true)
          document.removeEventListener('dragover', onDragOverContainer, false)
          document.removeEventListener('drop', onDropContainer, false)
          closeMenu()
          closeDialog()
          window.__dshWgDiagnose = undefined
          window.__dshWgOn = undefined
          for (const container of document.querySelectorAll(`[${ATTR}="tree"]`)) clearAdded(container)
          for (const node of document.querySelectorAll(`[${ATTR}="bar"]`)) node.remove()
        }
      }, `${NS}: sidebar group decoration`)
    }

    exports.apply = apply
    exports.inject = ['workspaces']
    return module.exports
  },
})
