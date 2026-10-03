// Shared helpers for the local check scripts.
//
// Everything here has to survive a DSH Desktop update, which may move the app
// between `resources/app` and `resources/app.asar.unpacked`, or relocate the
// harness's own plugin directory, without warning. Two installations are
// supported out of the box:
//
//   * the community DSH Desktop app (`%LOCALAPPDATA%\Programs\DSH Desktop`),
//     whose harness home defaults to `%APPDATA%\dsh-desktop\harness`;
//   * the official DeepSeek Harness app (`%LOCALAPPDATA%\Programs\DeepSeek
//     Harness`), whose harness home defaults to `%USERPROFILE%\.dsh` and whose
//     runtime lives in `resources/app.asar.unpacked/dsh` plus
//     `$DSH_HOME\dsh-runtimes`.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LOCAL = process.env.LOCALAPPDATA ?? ''
const APPDATA = process.env.APPDATA ?? ''
const USERPROFILE = process.env.USERPROFILE ?? ''

/** Candidate roots of the installed app, both layouts, newest first. */
export const APP_ROOTS = [
  join(LOCAL, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar.unpacked', 'dsh'),
  join(LOCAL, 'Programs', 'DeepSeek Harness', 'resources', 'runtime'),
  join(LOCAL, 'Programs', 'DSH Desktop', 'resources', 'app.asar.unpacked'),
  join(LOCAL, 'Programs', 'DSH Desktop', 'resources', 'app'),
  join(APPDATA, 'dsh-desktop', 'harness', 'node_modules'),
].filter((root) => root !== '' && existsSync(root))

/** The first app root that actually exists. */
export function resolveAppRoot() {
  const found = APP_ROOTS.find((root) => existsSync(root))
  if (found === undefined) {
    throw new Error(`no DSH app root found among:\n${APP_ROOTS.join('\n')}`)
  }
  return found
}

/** Harness home: `$DSH_HOME`, else the official `~\.dsh`, else the community default. */
export function resolveDshHome() {
  const explicit = process.env.DSH_HOME
  if (explicit !== undefined && explicit !== '') return explicit
  const official = join(USERPROFILE, '.dsh')
  if (existsSync(official)) return official
  return join(APPDATA, 'dsh-desktop', 'harness')
}

/**
 * The profile to check when `--profile` is not given: `$DSH_PROFILE`, else
 * whichever of the official `desktop` / community `web` profile exists.
 */
export function resolveDefaultProfile(dshHome = resolveDshHome()) {
  const explicit = process.env.DSH_PROFILE
  if (explicit !== undefined && explicit !== '') return explicit
  for (const name of ['desktop', 'web', 'tui']) {
    if (existsSync(join(dshHome, 'profiles', name, 'package.json'))) return name
  }
  return 'web'
}

/** A node executable shipped with the app or its managed runtime (falls back to PATH). */
export function resolveNode() {
  const candidates = [
    join(resolveDshHome(), 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    ...APP_ROOTS.map((root) => join(root, 'node_modules', 'node', 'bin', 'node.exe')),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return process.execPath || 'node'
}

/**
 * The YAML parser the Harness itself bundles.
 *
 * The official app keeps `yaml` inside `app.asar`, where plain Node cannot read
 * it, so the profile's hoisted `node_modules` is checked first.
 */
export async function loadYaml() {
  const dshHome = resolveDshHome()
  const candidates = [
    join(dshHome, 'profiles', 'node_modules', 'yaml', 'dist', 'index.js'),
    join(dshHome, 'profiles', resolveDefaultProfile(dshHome), 'node_modules', 'yaml', 'dist', 'index.js'),
    ...APP_ROOTS.map((root) => join(root, 'node_modules', 'yaml', 'dist', 'index.js')),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
  }
  throw new Error('no bundled YAML parser found (checked the harness home and the app roots)')
}

/** Read the profile manifest, or throw with a useful message. */
export function readProfile(dshHome, profile) {
  const dir = join(dshHome, 'profiles', profile)
  const packagePath = join(dir, 'package.json')
  if (!existsSync(packagePath)) throw new Error(`profile not found: ${dir}`)
  // PowerShell's `Set-Content -Encoding UTF8` writes a BOM; JSON.parse rejects it,
  // so strip it before parsing (the Harness tolerates both).
  const text = readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '')
  return {
    dir,
    packagePath,
    patchPath: join(dir, 'cordis.patch.yml'),
    manifest: JSON.parse(text),
  }
}

/**
 * Resolve one installed package inside a profile the way the loader does:
 * follow `node_modules/<name>` and report whether it lands on real files.
 *
 * A DSH Desktop update is known to leave this entry dangling (it repointed the
 * plugin directory) and to drop the package from `dsh.profile.bundles`; both
 * make the plugin vanish silently, so they are checked explicitly.
 */
export function resolveInstalled(dir, name) {
  const entry = join(dir, 'node_modules', name)
  const exists = existsSync(entry)
  let real = null
  let brokenTarget = null
  if (exists) {
    try {
      real = realpathSync(entry)
    } catch {
      brokenTarget = 'unresolvable link'
    }
  }
  return {
    entry,
    exists,
    real,
    brokenTarget,
    resolves: existsSync(join(entry, 'package.json')),
  }
}
