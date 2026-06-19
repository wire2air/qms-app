/**
 * Pure helpers for the list-page layout (Enterprise Page Framework A3 / L1).
 * Kept side-effect-free so they're trivially unit-testable; useListLayout wires
 * them to filter state, pagination, and the router.
 */

/** List content-state precedence: loading > error > empty > ready. */
export function resolveListState({ loading, error, empty } = {}) {
  if (loading) return 'loading'
  if (error) return 'error'
  if (empty) return 'empty'
  return 'ready'
}

/**
 * Serialize active filters into a flat query object, omitting anything equal to
 * its default (keeps URLs clean). Arrays → comma-separated string.
 *
 * @param {Record<string, any>} filters  current filter values
 * @param {Record<string, any>} defaults initial/default values to diff against
 */
export function filtersToQuery(filters = {}, defaults = {}) {
  const query = {}
  for (const key of Object.keys(filters)) {
    const v = filters[key]
    const d = defaults[key]
    if (Array.isArray(v)) {
      if (v.length) query[key] = v.join(',')
    } else if (v !== d && v !== '' && v !== null && v !== undefined) {
      query[key] = String(v)
    }
  }
  return query
}

/**
 * Hydrate filters from a query object, coercing each value to the TYPE of its
 * default (array → comma split, number → Number, boolean → 'true'). Keys not in
 * `defaults` are ignored; missing/empty query values fall back to the default.
 *
 * @param {Record<string, any>} query    raw query (string-valued)
 * @param {Record<string, any>} defaults default values (define the key set + types)
 */
export function queryToFilters(query = {}, defaults = {}) {
  const out = { ...defaults }
  for (const key of Object.keys(defaults)) {
    const raw = query[key]
    if (raw == null || raw === '') continue
    const d = defaults[key]
    if (Array.isArray(d)) {
      out[key] = String(raw).split(',').filter(Boolean)
    } else if (typeof d === 'number') {
      const n = Number(raw)
      out[key] = Number.isNaN(n) ? d : n
    } else if (typeof d === 'boolean') {
      out[key] = raw === 'true' || raw === true
    } else {
      out[key] = String(raw)
    }
  }
  return out
}

/** Encode a sort field + direction as a single token (`field` / `-field`). */
export function encodeSort(sortBy, descending) {
  if (!sortBy) return undefined
  return descending ? `-${sortBy}` : sortBy
}

/** Decode a sort token back to `{ sortBy, descending }`. */
export function decodeSort(token) {
  if (!token) return { sortBy: null, descending: false }
  const descending = token.startsWith('-')
  return { sortBy: descending ? token.slice(1) : token, descending }
}
