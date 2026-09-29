// Shared helpers for the local check scripts.
//
// Everything here has to survive a DSH Desktop update, which may move the app
// between `resources/app` and `resources/app.asar.unpacked`, or relocate the
// harness's own plugin directory, without warning.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Candidate roots of the installed DSH Desktop app, newest layout first. */
export const APP_ROOTS = [
  'C:/Users/ZhangShen/AppData/Local/Programs/DSH Desktop/resources/app.asar.unpacked',
  'C:/Users/ZhangShen/AppData/Local/Programs/DSH Desktop/resources/app',
]

/** The first app root that actually exists. */
export function resolveAppRoot() {
  const found = APP_ROOTS.find((root) => existsSync(root))
  if (found === undefined) throw new Error(`no DSH Desktop app root found among:\n${APP_ROOTS.join('\n')}`)
  return found
}

/** A node executable shipped with the app (falls back to PATH). */
export function resolveNode() {
  for (const root of APP_ROOTS) {
    const candidate = join(root, 'node_modules/node/bin/node.exe')
    if (existsSync(candidate)) return candidate
  }
  return 'node'
}

/** The YAML parser the Harness itself bundles. */
export async function loadYaml() {
  for (const root of APP_ROOTS) {
    const candidate = join(root, 'node_modules/yaml/dist/index.js')
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
  }
  throw new Error('no bundled YAML parser found in the DSH Desktop app roots')
}

/** `%APPDATA%\dsh-desktop\harness` unless DSH_HOME says otherwise. */
export function resolveDshHome() {
  return process.env.DSH_HOME ?? join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness')
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
