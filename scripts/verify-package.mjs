// One-shot validation of the packaged plugin repository: manifest shape,
// bundle syntax, and the patch layer parsed with the Harness-bundled YAML.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const repo = 'C:/Users/ZhangShen/Documents/DSH/dsh-workspace-groups'
const appModules = 'C:/Users/ZhangShen/AppData/Local/Programs/DSH Desktop/resources/app/node_modules'

const problems = []
const note = (message) => console.log(`  ${message}`)

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
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
  const { writeFileSync } = await import('node:fs')
  writeFileSync(baselinePath, `${clientHash}\n`)
  note(`client.js sha256 baseline written: ${clientHash}`)
} else if (existsSync(baselinePath)) {
  const expected = readFileSync(baselinePath, 'utf8').trim()
  note(`client.js sha256 ${clientHash} (recorded baseline ${expected === clientHash ? 'matches' : 'DIFFERS'})`)
  if (expected !== clientHash) problems.push('client.js changed since the recorded baseline — re-test, then run --write-baseline')
} else {
  note(`client.js sha256 ${clientHash} (no baseline recorded yet)`)
}

const yamlEntry = join(appModules, 'yaml/dist/index.js')
const YAML = await import(pathToFileURL(yamlEntry).href)
const patch = YAML.parse(readFileSync(join(repo, 'cordis.patch.yml'), 'utf8'))
const row = Array.isArray(patch) ? patch[0]?.insert?.[0] : undefined
if (row === undefined) problems.push('cordis.patch.yml has no insert row')
else note(`patch row: id=${row.id} name=${row.name} guarded=${typeof row.disabled === 'string'}`)

for (const file of ['index.js', 'client.js']) {
  const text = readFileSync(join(repo, file), 'utf8')
  note(`${file}: ${text.length} bytes`)
}

console.log(problems.length === 0 ? 'RESULT: OK' : `RESULT: PROBLEMS -> ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
