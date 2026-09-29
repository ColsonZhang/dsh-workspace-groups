// Validation of the packaged plugin repository: manifest shape, shipped bundle
// syntax/bytes, and the bundle patch parsed with the Harness-bundled YAML.
//
// Paths are derived from this file, so the script works from any checkout, and
// the YAML parser is optional: on a machine without the DSH Desktop app (CI) the
// patch is checked textually instead.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { loadYaml } from './_lib.mjs'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const problems = []
const note = (message) => console.log(`  ${message}`)

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('dsh.bundle.patch missing')
if (pkg.dsh?.client?.platform !== 'web') problems.push('dsh.client.platform missing')
for (const field of ['name', 'version', 'description', 'license', 'type']) {
  if (typeof pkg[field] !== 'string' || pkg[field] === '') problems.push(`package.json.${field} missing`)
}
if (pkg.exports?.['./client'] !== './client.js') problems.push('exports["./client"] missing')
note(`name=${pkg.name} version=${pkg.version}`)
note(`dsh.bundle.patch=${pkg.dsh?.bundle?.patch} dsh.client.platform=${pkg.dsh?.client?.platform}`)

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

// The client bundle is source-shipped: record its digest so a later edit that
// forgets to re-test is visible. `--write-baseline` refreshes the record.
const baselinePath = join(repo, 'scripts/client.sha256')
const clientHash = hash(join(repo, 'client.js'))
if (process.argv.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${clientHash}\n`)
  note(`client.js sha256 baseline written: ${clientHash}`)
} else if (existsSync(baselinePath)) {
  const expected = readFileSync(baselinePath, 'utf8').trim()
  note(`client.js sha256 ${clientHash} (recorded baseline ${expected === clientHash ? 'matches' : 'DIFFERS'})`)
  if (expected !== clientHash) {
    problems.push('client.js changed since the recorded baseline — re-test, then run --write-baseline')
  }
} else {
  note(`client.js sha256 ${clientHash} (no baseline recorded yet)`)
}

const patchPath = join(repo, 'cordis.patch.yml')
const patchText = readFileSync(patchPath, 'utf8')
try {
  const YAML = await loadYaml()
  const patch = YAML.parse(patchText)
  const row = Array.isArray(patch) ? patch[0]?.insert?.[0] : undefined
  if (row === undefined) problems.push('cordis.patch.yml has no insert row')
  else note(`patch row: id=${row.id} name=${row.name} guarded=${typeof row.disabled === 'string'}`)
} catch (error) {
  note(`bundled YAML parser unavailable (${String(error.message).slice(0, 60)}…) — falling back to a textual check`)
  if (!patchText.includes("name: 'dsh-workspace-groups'")) {
    problems.push('cordis.patch.yml does not mount dsh-workspace-groups')
  }
  if (!patchText.includes('disabled: !!js')) problems.push('cordis.patch.yml lost its duplicate-mount guard')
}

for (const file of ['index.js', 'client.js']) {
  const text = readFileSync(join(repo, file), 'utf8')
  note(`${file}: ${text.length} bytes`)
}
for (const file of ['README.md', 'README.zh.md', 'LICENSE', 'cordis.patch.yml', 'CHANGELOG.md']) {
  if (!existsSync(join(repo, file))) problems.push(`missing shipped file: ${file}`)
}

console.log(problems.length === 0 ? 'RESULT: OK' : `RESULT: PROBLEMS -> ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
