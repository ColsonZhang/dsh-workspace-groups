// Pre-flight check for the DSH profile that mounts this plugin.
//
// The loader rejects a duplicated entry id with
// "duplicate loader entry id: <id>" and refuses to boot the whole plugin tree,
// which makes DSH Desktop fall back to safe mode. A duplicated mount happens
// when both a bundle's own patch (this package declares `dsh.bundle.patch`) and
// a hand-written row in the profile's `cordis.patch.yml` insert the same id.
//
//   node scripts/check-profile-mount.mjs [--profile web]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const profileIndex = args.indexOf('--profile')
const profile = profileIndex === -1 ? 'web' : args[profileIndex + 1]
const dshHome = process.env.DSH_HOME ?? join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness')
const profileDir = join(dshHome, 'profiles', profile)
const patchPath = join(profileDir, 'cordis.patch.yml')
const packagePath = join(profileDir, 'package.json')

const problems = []
const notes = []
const say = (message) => console.log(`  ${message}`)

if (!existsSync(packagePath)) {
  console.error(`profile not found: ${profileDir}`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
const bundles = pkg.dsh?.profile?.bundles ?? []
const bundled = bundles.includes('dsh-workspace-groups')
say(`profile              ${profileDir}`)
say(`bundle declared      ${bundled}`)

const yamlEntry = [
  'C:/Users/ZhangShen/AppData/Local/Programs/DSH Desktop/resources/app/node_modules/yaml/dist/index.js',
  join(dshHome, 'profiles/node_modules/yaml/dist/index.js'),
].find((candidate) => existsSync(candidate))
if (yamlEntry === undefined) {
  console.error('no YAML parser found to read the patch layer')
  process.exit(1)
}
const YAML = await import(pathToFileURL(yamlEntry).href)
const parsed = YAML.parse(readFileSync(patchPath, 'utf8')) ?? []

/** Every entry id mounted by `insert` rows in the profile patch layer. */
const insertedIds = []
for (const entry of parsed) {
  if (Array.isArray(entry?.insert)) {
    for (const row of entry.insert) {
      if (row?.id !== undefined) insertedIds.push({ id: row.id, disabled: row.disabled === true })
    }
  }
}
const activeInserts = insertedIds.filter((row) => !row.disabled)
say(`patch inserts        ${insertedIds.map((row) => `${row.id}${row.disabled ? '(disabled)' : ''}`).join(', ') || '(none)'}`)

// The bundle's own patch mounts the plugin whenever the bundle is in the stack.
//
// The loader's duplicate check (`EntryGroup.update`) only compares ids — it does
// NOT skip disabled rows — so ANY row in this patch layer carrying the bundle's
// id is fatal, even one written as `disabled: true`.
if (bundled) {
  const colliding = insertedIds.filter((row) => row.id === 'workspace-groups')
  if (colliding.length > 0) {
    problems.push(
      `the bundle patch inserts id "workspace-groups", so the profile patch must not insert it too ` +
        `(found ${colliding.length} row(s), ${colliding.some((row) => !row.disabled) ? 'one of them enabled' : 'all disabled — disabled still counts'}) ` +
        '— delete the row or give it a different id',
    )
  }
}
if (insertedIds.filter((row) => row.id === 'workspace-groups').length > 1) {
  problems.push('the profile patch inserts id "workspace-groups" more than once')
}
const duplicates = insertedIds.map((row) => row.id).filter((id, index, all) => all.indexOf(id) !== index)
if (duplicates.length > 0) problems.push(`duplicate ids in the profile patch: ${[...new Set(duplicates)].join(', ')}`)
if (!bundled && activeInserts.every((row) => row.id !== 'workspace-groups')) {
  problems.push('neither the bundle stack nor the profile patch mounts "workspace-groups" — the plugin will not load')
}

for (const note of notes) say(note)
console.log(problems.length === 0 ? 'RESULT: OK' : `RESULT: PROBLEMS -> ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
