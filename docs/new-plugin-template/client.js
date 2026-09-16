/**
 * Client half of `<your-plugin-name>`.
 *
 * A browser bundle is loaded through the Harness module loader: the file must be
 * reachable as `<package>/client` (declared in `exports["./client"]`) and must
 * call `window.__ModuleLoader__.load({ id, factory })` exactly once with a
 * factory that returns a module exposing `apply` (and optionally `inject`).
 *
 * Everything the module needs is passed to `require(...)` by the loader: React,
 * `@deepseek-ai/dsh-client-ui-*` packages, and the virtual service names listed
 * in this package's `dsh.client.inject` / the module's own `inject` array.
 *
 * Typical shapes:
 *   - claim a slot:      ctx.slots.register({ name: 'some.slot' }, Component)
 *   - read app state:    const workspaces = ctx.get('workspaces')
 *   - subscribe:         workspaces.list.subscribe(() => { ... })
 *   - DOM decoration:    insert your own nodes around React-owned ones, keep a
 *                        `data-*` namespace, never move or mutate foreign nodes,
 *                        and add a console kill switch.
 */
window.__ModuleLoader__.load({
  id: '<your-plugin-name>',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const NS = '<your-plugin-name>'

    function apply(ctx) {
      ctx.effect(() => {
        console.info(`[${NS}] mounted`)
        return () => {
          console.info(`[${NS}] disposed`)
        }
      }, `${NS}: mount`)
    }

    exports.apply = apply
    // Services this module waits for before `apply` runs.
    exports.inject = []
    return module.exports
  },
})
