/**
 * Host half of `<your-plugin-name>`.
 *
 * Runs inside the Harness (Node) process. Keep it empty when the plugin is
 * browser-only: an empty `apply()` is a valid Host half and keeps the plugin
 * out of every Host-side concern (storage, tools, routes, approvals).
 *
 * When you do need Host logic, declare what you consume so the loader waits for
 * it, for example:
 *
 *   export const inject = ['storageDomain', 'settings']
 *   export const name = '<your-plugin-name>'
 *
 *   export function apply(ctx) {
 *     ctx.effect(() => () => { ...dispose... }, '<your-plugin-name>: cleanup')
 *   }
 */
export function apply() {}
