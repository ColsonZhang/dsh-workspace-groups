// Pre-flight check for the DSH profile that mounts this plugin.
//
// Two failure modes are covered, both seen in practice:
//
//  1. duplicated loader id — the loader (`EntryGroup.update`) compares ids only
//     and ignores `disabled`, so a bundle patch plus a hand-written row with the
//     same id refuses to boot the whole plugin tree (DSH Desktop → safe mode);
//  2. a broken installation — a DSH Desktop update can repoint
//     `node_modules/<name>` at a directory that no longer exists and drop the
//     package from `dsh.profile.bundles`, after which the plugin silently
//     disappears.
//
//   node scripts/check-profile-mount.mjs [--profile web]
import { existsSync, readFileSync } from 'node:fs'
import { loadYaml, readProfile, resolveDshHome, resolveInstalled } from './_lib.mjs'

const PACKAGE = 'dsh-workspace-groups'
const ENTRY_ID = 'workspace-groups'

const args = process.argv.slice(2)
const profileIndex = args.indexOf('--profile')
const profile = profileIndex === -1 ? 'web' : args[profileIndex + 1]

const problems = []
const say = (message) => console.log(`  ${message}`)

const dshHome = resolveDshHome()
const { dir, patchPath, manifest } = readProfile(dshHome, profile)
const bundles = manifest.dsh?.profile?.bundles ?? []
const bundled = bundles.includes(PACKAGE)
const installed = resolveInstalled(dir, PACKAGE)

say(`profile              ${dir}`)
say(`bundle declared      ${bundled}`)
say(
  `installed at         ${
    installed.resolves ? installed.real : installed.exists ? '(entry exists but does not resolve)' : '(missing)'
  }`,
)

const YAML = await loadYaml()
const parsed = YAML.parse(readFileSync(patchPath, 'utf8')) ?? []

/** Every entry id mounted by `insert` rows in the profile patch layer. */
const insertRows = []
for (const entry of parsed) {
  if (Array.isArray(entry?.insert)) {
    for (const row of entry.insert) {
      if (row?.id !== undefined) insertRows.push({ id: row.id, disabled: row.disabled === true })
    }
  }
}
say(`patch inserts        ${insertRows.map((row) => `${row.id}${row.disabled ? '(disabled)' : ''}`).join(', ') || '(none)'}`)

// 1) installation integrity
if (bundled && !installed.resolves) {
  problems.push(
    `"${PACKAGE}" is in dsh.profile.bundles but does not resolve inside the profile ` +
      `(entry: ${installed.entry}) — recreate the link/junction, e.g. scripts/link-dev.ps1`,
  )
}
if (!bundled) {
  problems.push(
    `"${PACKAGE}" is missing from dsh.profile.bundles — a desktop update drops it when the install is broken`,
  )
}

// 2) mount collisions. The loader ignores `disabled` while checking ids, so ANY
// row carrying the bundle's id is fatal, even one written as `disabled: true`.
if (bundled) {
  const colliding = insertRows.filter((row) => row.id === ENTRY_ID)
  if (colliding.length > 0) {
    problems.push(
      `the bundle patch inserts id "${ENTRY_ID}", so the profile patch must not insert it too ` +
        `(found ${colliding.length} row(s)${
          colliding.some((row) => !row.disabled) ? ', one enabled' : ', all disabled — disabled still counts'
        }) — delete the row or give it a different id`,
    )
  }
}
if (insertRows.filter((row) => row.id === ENTRY_ID).length > 1) {
  problems.push(`the profile patch inserts id "${ENTRY_ID}" more than once`)
}
const duplicates = insertRows.map((row) => row.id).filter((id, index, all) => all.indexOf(id) !== index)
if (duplicates.length > 0) problems.push(`duplicate ids in the profile patch: ${[...new Set(duplicates)].join(', ')}`)
if (!bundled && !insertRows.some((row) => row.id === ENTRY_ID && row.disabled !== true)) {
  problems.push(`nothing mounts "${ENTRY_ID}" (neither the bundle stack nor the profile patch) — the plugin will not load`)
}

// 3) the patch file must stay readable
if (!existsSync(patchPath)) problems.push(`patch layer missing: ${patchPath}`)

console.log(problems.length === 0 ? 'RESULT: OK' : `RESULT: PROBLEMS -> ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
