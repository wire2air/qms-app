/**
 * Which sites may be OFFERED in a site picker.
 *
 * `isActive: false` gates NEW assignment only — an inactive site keeps the
 * assignments it already has, so that winding a site down does not silently
 * revoke a regional manager's access to the records still open there.
 *
 * Which means an already-SELECTED inactive site must keep being offered. Drop it
 * and two things break: the chip vanishes (misrepresenting the user's real
 * access), and the next save round-trips a value the picker never showed —
 * silently un-assigning a site nobody asked to remove.
 *
 * Soft-deleted sites never reach here: the syncEngine excludes them from queries
 * by default, and they contribute no access server-side either.
 *
 * @param {Array<{id: string, isActive?: boolean}>} sites
 * @param {string|string[]|null} selected - current model value (single or multiple)
 * @returns {Array} the sites to offer
 */
export function selectableSites(sites, selected) {
  const list = Array.isArray(sites) ? sites : []
  const selectedIds = Array.isArray(selected) ? selected : [selected].filter(Boolean)
  // `!== false` rather than `=== true`: a site loaded before the isActive column
  // existed (or from a stale IndexedDB) has it undefined, and must stay usable.
  return list.filter((s) => s.isActive !== false || selectedIds.includes(s.id))
}
