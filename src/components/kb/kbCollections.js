/**
 * Knowledge base folders (kb_collections): a tree by parentId, at most three
 * levels deep (backend services/kbService.js). Shown in the desk as folders;
 * on the help center they are its categories and sections.
 */
export const KB_FOLDER_MAX_DEPTH = 3

function byPosition(a, b) {
  return a.position - b.position || a.title.localeCompare(b.title)
}

/** Children per parent id ('' = top level), each list in display order. */
export function kbChildren(collections) {
  const map = new Map()
  for (const c of collections) {
    const k = c.parentId || ''
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(c)
  }
  for (const list of map.values()) list.sort(byPosition)
  return map
}

/** The tree flattened in display order: [{ c, depth, path }] (path = titles from the top). */
export function kbCollectionTree(collections) {
  const children = kbChildren(collections)
  const out = []
  function walk(parent, depth, path) {
    for (const c of children.get(parent) || []) {
      const p = [...path, c.title]
      out.push({ c, depth, path: p })
      walk(c.id, depth + 1, p)
    }
  }
  walk('', 0, [])
  return out
}

/** Options for a folder picker: "Billing › Refunds". */
export function kbCollectionOptions(collections) {
  return kbCollectionTree(collections).map((t) => ({ value: t.c.id, label: t.path.join(' › ') }))
}

/** A folder and every folder inside it. */
export function kbDescendantIds(collections, id) {
  const children = kbChildren(collections)
  const out = new Set([id])
  const stack = [id]
  while (stack.length)
    for (const c of children.get(stack.pop()) || []) {
      out.add(c.id)
      stack.push(c.id)
    }
  return out
}
