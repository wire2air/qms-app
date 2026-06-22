/**
 * Pure helpers for the cascading filter framework (descriptor-driven flyouts).
 * Side-effect-free so the recursive flyout component stays thin + testable.
 * See docs/filter-framework-plan.md for the FilterNode shape.
 */

/** A node opens a submenu if it has children or an `options` shorthand. */
export function hasChildren(node) {
  return !!(node && (node.children || node.options))
}

/** Children are async when `children` is a function. */
export function isAsync(node) {
  return typeof node?.children === 'function'
}

/**
 * Resolve a node's child nodes. `options` shorthand expands into selectable
 * leaves bound to the node's `group`/`select`. Async children (function) are
 * loaded by the component, not here.
 */
export function resolveChildren(node) {
  if (!node) return []
  if (Array.isArray(node.children)) return node.children
  if (Array.isArray(node.options)) {
    return node.options.map((o) => ({
      id: `${node.group}:${o.value}`,
      label: o.label,
      value: o.value,
      group: node.group,
      select: node.select || 'check',
      icon: o.icon,
      count: o.count,
    }))
  }
  return []
}

/** Is this leaf currently selected in the model? */
export function isChecked(model, group, value, select = 'check') {
  if (!group) return false
  const cur = model?.[group]
  if (select === 'radio') return cur === value
  return Array.isArray(cur) && cur.includes(value)
}

/** Return a NEW model with `node`'s selection toggled (multi) or set (radio). */
export function toggleSelection(model, node) {
  const { group, value, select = 'check' } = node || {}
  if (!group) return model
  const next = { ...model }
  if (select === 'radio') {
    next[group] = next[group] === value ? null : value
  } else {
    const cur = Array.isArray(next[group]) ? next[group] : []
    next[group] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
  }
  return next
}

/** Filter a node list by a search query (keeps dividers/sections). */
export function searchNodes(nodes = [], query = '') {
  const q = (query || '').trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter(
    (n) => n.type === 'divider' || n.type === 'section' || (n.label || '').toLowerCase().includes(q),
  )
}

/** Count selection buckets that have at least one active value (trigger badge). */
export function countActiveGroups(model = {}) {
  return Object.values(model || {}).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== '',
  ).length
}

/** Show an inline search box once a submenu has more than this many options. */
export const SEARCH_THRESHOLD = 8
export function shouldSearch(node, childCount) {
  if (node?.searchable === false) return false
  if (node?.searchable === true) return true
  return childCount > SEARCH_THRESHOLD
}
