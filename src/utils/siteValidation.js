/**
 * siteValidation.js — the Sites create/edit dialog's rules, as pure functions.
 *
 * They live here rather than inline in the component for two reasons:
 *
 *  1. They encode DB-level invariants (`sites.code` is `STRING(10)`; the
 *     `sites_company_name_unique` index is on `lower(btrim(name))`), and an
 *     invariant nobody can unit-test is one that drifts.
 *  2. Both uniqueness checks used to run their own `db.Site.where().exec()`
 *     full scan on every keystroke. Taking a plain array lets the component
 *     hold ONE live query and derive both answers from it.
 */

/** `sites.code` is `STRING(10)` — see backend/shared/models/site.js. */
export const SITE_CODE_MAX_LENGTH = 10

/**
 * The single timezone default. The model declares `'UTC'` on both sides
 * (models/site.js, backend/shared/models/site.js) and the REST controller
 * coalesces to `'UTC'` — the form used to initialise `null`, which bypassed
 * every one of them.
 */
export const DEFAULT_TIMEZONE = 'UTC'

/**
 * Normalize a name the way the DB unique index does: `lower(btrim(name))`.
 * Matching any other way means the client says "available" and Postgres says
 * 23505.
 */
export function normalizeSiteName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
}

/**
 * Normalize a code for comparison. There is no unique index on
 * `(company_id, code)` — uniqueness is app-enforced, and the REST controller
 * compares against `code.trim().toUpperCase()`
 * (api/controllers/sites.js:59-69). So the client must compare
 * case-insensitively too, or `ny-hq` sails past the live check and is then
 * rejected by the server as a duplicate of `NY-HQ`.
 */
export function normalizeSiteCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Is `code` free among `sites`? `currentId` excludes the row being edited.
 * An empty or 1-character code is treated as "not yet answerable" (true) so
 * the field doesn't flash an error while the user is still typing.
 *
 * @param {Array<{id: string, code?: string}>} sites
 */
export function isSiteCodeAvailable(sites, code, currentId = null) {
  const wanted = normalizeSiteCode(code)
  if (wanted.length < 2) return true
  const list = Array.isArray(sites) ? sites : []
  return !list.some((s) => normalizeSiteCode(s.code) === wanted && s.id !== currentId)
}

/**
 * Is `name` free among `sites`? Case- and whitespace-insensitive, mirroring
 * `sites_company_name_unique`. `currentId` excludes the row being edited.
 *
 * @param {Array<{id: string, name?: string}>} sites
 */
export function isSiteNameAvailable(sites, name, currentId = null) {
  const wanted = normalizeSiteName(name)
  if (!wanted) return true
  const list = Array.isArray(sites) ? sites : []
  return !list.some((s) => normalizeSiteName(s.name) === wanted && s.id !== currentId)
}

/**
 * Derive a code suggestion from a site name, then make it unique against the
 * codes already in use by appending `-1`, `-2`, … The base is truncated to
 * SITE_CODE_MAX_LENGTH, and so is every candidate — a suffix must not push the
 * result past the column width.
 *
 * @param {string} name
 * @param {Array<{code?: string}>} sites
 * @returns {string}
 */
export function suggestSiteCode(name, sites) {
  const base = String(name ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, SITE_CODE_MAX_LENGTH)
    // Truncation (and accented or punctuated names) can leave a dangling
    // separator — "São Paulo!!" used to suggest `S-O-PAULO-`.
    .replace(/^-+|-+$/g, '')

  if (!base) return ''

  const list = Array.isArray(sites) ? sites : []
  const taken = new Set(list.map((s) => normalizeSiteCode(s.code)))

  if (!taken.has(normalizeSiteCode(base))) return base

  for (let counter = 1; counter < 1000; counter++) {
    const suffix = `-${counter}`
    const candidate = `${base.substring(0, SITE_CODE_MAX_LENGTH - suffix.length)}${suffix}`
    if (!taken.has(normalizeSiteCode(candidate))) return candidate
  }
  // Every one of 999 variants taken — hand back the base and let the live
  // uniqueness check tell the user, rather than looping forever.
  return base
}

/**
 * Is `tz` a timezone the platform actually understands?
 *
 * `timezone` had no validation anywhere — not in the Zod schema, not on the
 * model, not in the form — so any string could be persisted into a column that
 * every date rendering downstream trusts. `Intl.DateTimeFormat` is the same
 * resolver the app formats with, so it is the correct authority.
 */
export function isValidTimezone(tz) {
  const value = String(tz ?? '').trim()
  if (!value) return false
  try {
    // Throws RangeError for an unknown zone.
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Form rule: a non-empty timezone must be a real IANA zone. */
export function timezoneRule(msg) {
  return (value) => {
    if (!value || isValidTimezone(value)) return true
    return msg || 'Pick a valid timezone.'
  }
}

/**
 * Turn a failed Site save into a message naming the FIELD at fault.
 *
 * The client pre-checks both name and code, but those checks read IndexedDB —
 * which can lag another user's create by seconds. When it does, the DB's
 * `sites_company_name_unique` fires and the user gets a raw
 * "duplicate key value violates unique constraint …", or the generic
 * "That already exists" from friendlyMutationError. Neither says which box to
 * change.
 *
 * NOTE the phrasing: `useLiveQuery.js`'s friendlyMutationError rewrites any
 * message matching /duplicate key|unique constraint|already exists/i back to
 * the generic string, so these deliberately avoid those words. The spec pins
 * that coupling.
 *
 * @param {unknown} err
 * @param {{name?: string, code?: string}} [form]
 * @returns {string} a user-facing message (never empty)
 */
export function siteSaveErrorMessage(err, form = {}) {
  const raw = (err && typeof err === 'object' && 'message' in err ? err.message : '') || ''
  const msg = String(raw)

  const isUnique = /duplicate key|unique constraint|already exists|23505/i.test(msg)
  if (isUnique) {
    // The index name is the only reliable discriminator — the message text
    // differs between the GraphQL and REST paths.
    if (/sites_company_name_unique/i.test(msg) || !/code/i.test(msg)) {
      const label = form.name ? ` "${String(form.name).trim()}"` : ''
      return `Another site is using the name${label}. Pick a different name.`
    }
    const label = form.code ? ` "${String(form.code).trim()}"` : ''
    return `Another site is using the code${label}. Pick a different code.`
  }

  if (!msg || /logged with hash/i.test(msg) || /^an error occurred/i.test(msg)) {
    return 'Could not save the site. Please try again.'
  }
  return msg
}
