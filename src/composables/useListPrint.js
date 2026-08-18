/**
 * Print the records currently listed on a list page.
 *
 * Opens the shared /print route with `module=RecordList`, which renders
 * RecordListPrint.vue — one generic table-shaped printout for every register
 * (CAPA, NC, Change Control, Quality Events, Documents, Audits, QC lots,
 * Submissions) rather than eight near-identical print modules.
 *
 * ── Why the ids go through localStorage ──────────────────────────────────────
 * The obvious design is `?ids=a,b,c`. A 500-row register is ~18 KB of URL,
 * which browsers accept unevenly and proxies truncate silently — and a
 * truncated id list prints a short register that LOOKS complete, which for a
 * QMS record is the worst possible failure. So the caller stashes the resolved
 * rows under a one-shot key and passes only the key. The print view reads it
 * once and deletes it.
 *
 * localStorage, not sessionStorage: the printout opens in a new tab, and
 * sessionStorage is per-tab so the new tab would see nothing.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 *   'current' — exactly what the list is showing, filters and all
 *   'all'     — every row of that entity the user can see, ignoring filters
 *
 * 'all' passes no ids: the print view re-queries the entity itself. Handing it
 * the full id list would just be the URL problem again in a different coat, and
 * the print view has the same RLS-scoped IndexedDB to read from.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const KEY_PREFIX = 'qms.printList.'
/** Stale handoffs are cleaned up on the next print rather than lingering. */
const MAX_AGE_MS = 5 * 60 * 1000

function newKey() {
  return `${KEY_PREFIX}${crypto.randomUUID()}`
}

/**
 * Drop handoffs older than MAX_AGE_MS.
 *
 * A handoff normally deletes itself when the print view reads it; these are the
 * ones where the user closed the tab before it loaded. Without this they
 * accumulate in localStorage for the life of the browser profile.
 */
function sweepStale() {
  const now = Date.now()
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith(KEY_PREFIX)) continue
    try {
      const { stampedAt } = JSON.parse(localStorage.getItem(key)) ?? {}
      if (!stampedAt || now - stampedAt > MAX_AGE_MS) localStorage.removeItem(key)
    } catch {
      localStorage.removeItem(key) // unparseable — it is no use to anyone
    }
  }
}

/**
 * Turn a pill value into something printable: 'all_open' → 'All open'. Saves
 * every caller from duplicating its toolbar's label map just to caption a page.
 *
 * @param {string} value
 * @returns {string}
 */
export function humanizeFilter(value) {
  if (!value) return ''
  const spaced = String(value).replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * @param {object} opts
 * @param {string} opts.entity     SyncEngine model name ('Capa', 'Nonconformance', …)
 * @param {string} opts.title      Heading for the printout ('CAPA Register')
 * @param {() => object[]} opts.rows  Resolver for the rows currently listed
 * @param {string|(() => string)} [opts.filterLabel] Human description of the
 *   active filter, printed under the heading so the paper says what it is a
 *   list OF. Pass `() => humanizeFilter(activeFilter)` for the usual case.
 */
export function useListPrint({ entity, title, rows, filterLabel }) {
  function open(scope = 'current') {
    const params = new URLSearchParams({ module: 'RecordList', entity, scope })
    if (title) params.set('title', title)

    if (scope === 'current') {
      const current = (typeof rows === 'function' ? rows() : rows) ?? []
      sweepStale()
      const key = newKey()
      localStorage.setItem(
        key,
        JSON.stringify({
          stampedAt: Date.now(),
          ids: current.map((r) => r.id).filter(Boolean),
          filterLabel: typeof filterLabel === 'function' ? filterLabel() : (filterLabel ?? ''),
        }),
      )
      params.set('key', key)
    }

    window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
  }

  return {
    /** Print exactly what the list is showing. */
    printCurrent: () => open('current'),
    /** Print every record of this entity, ignoring the active filters. */
    printAll: () => open('all'),
  }
}

/**
 * Read and consume a handoff written by useListPrint. Returns null when the key
 * is missing or stale — the print view falls back to printing everything, which
 * is wrong-but-visible rather than silently empty.
 */
export function consumeListPrintHandoff(key) {
  if (!key?.startsWith(KEY_PREFIX)) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    localStorage.removeItem(key) // one-shot
    const parsed = JSON.parse(raw)
    if (!parsed?.stampedAt || Date.now() - parsed.stampedAt > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}
