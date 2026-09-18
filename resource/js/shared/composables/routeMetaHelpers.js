/**
 * Pure helpers for the route-metadata system (Enterprise Page Framework B7 / L1).
 * A registry maps path PATTERNS (literal segments + `:param` placeholders) to
 * metadata `{ title, icon, parent, permission }`; these helpers match the
 * current path against it and build the breadcrumb trail by walking `parent`
 * links. Side-effect-free so they're trivially unit-testable; useRouteMeta wires
 * them to the live route + document.title.
 *
 * @typedef {Object} RouteMetaEntry
 * @property {string | ((params: object, ctx: object) => string)} title
 * @property {object} [icon]                 // @tabler/icons-vue component
 * @property {string} [parent]               // a pattern key — forms the breadcrumb chain
 * @property {string | string[]} [permission]
 */

/** Match a path against a `:param` pattern. Returns params or null. */
export function matchPattern(pattern, path) {
  const pp = pattern.split('/').filter(Boolean)
  const ps = path.split('/').filter(Boolean)
  if (pp.length !== ps.length) return null
  const params = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ps[i])
    else if (pp[i] !== ps[i]) return null
  }
  return params
}

/** Substitute params back into a pattern to produce a concrete path. */
export function fillPattern(pattern, params = {}) {
  const segs = pattern
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? (params[s.slice(1)] ?? '') : s))
  return '/' + segs.join('/')
}

/** Resolve the registry entry best matching a path (most literal segments wins). */
export function resolveRouteMeta(registry, path) {
  let best = null
  for (const pattern of Object.keys(registry)) {
    const params = matchPattern(pattern, path)
    if (!params) continue
    const literals = pattern.split('/').filter((s) => s && !s.startsWith(':')).length
    if (!best || literals > best.literals) best = { pattern, meta: registry[pattern], params, literals }
  }
  return best ? { pattern: best.pattern, meta: best.meta, params: best.params } : null
}

function resolveTitle(meta, params, ctx) {
  return typeof meta.title === 'function' ? meta.title(params, ctx) : meta.title
}

/**
 * Build the breadcrumb trail for a path: walk the matched entry's `parent`
 * chain root-first. The last crumb (current page) has no `to`. `ctx` carries
 * dynamic data (e.g. `{ recordTitle }`) for function titles on detail pages.
 *
 * @returns {Array<{ label: string, to?: string }>}
 */
export function buildBreadcrumbs(registry, path, ctx = {}) {
  const crumbs = []
  const seen = new Set()
  let current = resolveRouteMeta(registry, path)
  while (current && !seen.has(current.pattern)) {
    seen.add(current.pattern)
    crumbs.unshift({
      label: resolveTitle(current.meta, current.params, ctx),
      to: fillPattern(current.pattern, current.params),
    })
    const parent = current.meta.parent
    if (!parent) break
    current = resolveRouteMeta(registry, fillPattern(parent, current.params))
  }
  if (crumbs.length) delete crumbs[crumbs.length - 1].to
  return crumbs
}
