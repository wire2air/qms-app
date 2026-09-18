/**
 * The vocabulary of `analytics_widgets.period_token`.
 *
 * ── WHY A TOKEN AND NOT TWO DATES ───────────────────────────────────────────
 * A dashboard stores a QUESTION, never an ANSWER, and a period is part of the
 * question. "Last 12 months" asked in January and read in June must mean two
 * different windows — that is the whole point of saving it. Persisting resolved
 * dates would freeze the dashboard to the months that happened to be current
 * when somebody clicked Save, and it would do so silently: the tile would keep
 * rendering, keep looking fresh, and quietly answer last year's question.
 *
 * The column's own COMMENT says the same thing, so this file is the client half
 * of a contract the database states explicitly:
 *   'A RELATIVE token such as last_12_months, not resolved dates …'
 *
 * ── WHY THE PICKER OFFERS NO CUSTOM RANGE ───────────────────────────────────
 * `BaseDateFilter` can express an absolute `between` window, and a widget
 * builder that exposed it would let a user save exactly the frozen period this
 * column exists to prevent. So the builder's period control is a select over
 * THIS list, not a date filter. The invariant is then structural rather than a
 * rule somebody has to remember: there is no code path that can put a date in
 * `period_token`, because every value it can hold is an id from this array.
 *
 * ── HOW A TOKEN BECOMES DATES ───────────────────────────────────────────────
 * Each token carries a `relative` descriptor in exactly the shape
 * `BaseDateFilter` already emits (`{ dir, unit, count }`), so resolution goes
 * through the app's existing `periodFromDateToken()` rather than a second,
 * drifting date implementation.
 */
import { periodFromDateToken } from '@/utils/analyticsFormat.js'

/**
 * The canonical default.
 *
 * It resolves to `{ periodStart: null, periodEnd: null }` — i.e. it asks the
 * server for ITS default rather than deriving a window here, and that is
 * deliberate. Every metric in the catalog buckets by MONTH, and the server's
 * default is the trailing twelve WHOLE months (2025-09-01 → 2026-08-31 when
 * asked in August). A client-side "12 months back from today" would start
 * mid-month, half-filling the first bucket and making the earliest point on
 * every trend line read as a dip that is really just a partial month.
 */
export const DEFAULT_PERIOD_TOKEN = 'last_12_months'

/**
 * The offerable windows. `relative` is null for the default (see above); every
 * other entry is a `BaseDateFilter` relative descriptor.
 *
 * Order is the order the select shows: rolling day windows, then rolling month
 * windows, then calendar-to-date periods.
 */
export const PERIOD_TOKENS = [
  { id: 'last_30_days', label: 'Last 30 days', relative: { dir: 'past', unit: 'day', count: 30 } },
  { id: 'last_90_days', label: 'Last 90 days', relative: { dir: 'past', unit: 'day', count: 90 } },
  {
    id: 'last_3_months',
    label: 'Last 3 months',
    relative: { dir: 'past', unit: 'month', count: 3 },
  },
  {
    id: 'last_6_months',
    label: 'Last 6 months',
    relative: { dir: 'past', unit: 'month', count: 6 },
  },
  // The default — deliberately null, so the server's whole-month window wins.
  { id: 'last_12_months', label: 'Last 12 months', relative: null },
  {
    id: 'last_24_months',
    label: 'Last 24 months',
    relative: { dir: 'past', unit: 'month', count: 24 },
  },
  { id: 'this_month', label: 'This month', relative: { dir: 'this', unit: 'month' } },
  { id: 'this_quarter', label: 'This quarter', relative: { dir: 'this', unit: 'quarter' } },
  { id: 'this_year', label: 'This year', relative: { dir: 'this', unit: 'year' } },
]

const BY_ID = new Map(PERIOD_TOKENS.map((t) => [t.id, t]))

/** Options for a `BaseSelect`. */
export const PERIOD_TOKEN_OPTIONS = PERIOD_TOKENS.map((t) => ({ value: t.id, label: t.label }))

/**
 * Is this string one the `period_token` column may hold?
 * @param {string|null|undefined} id
 */
export function isPeriodToken(id) {
  return BY_ID.has(id)
}

/**
 * Human label for a token. An unknown token (a row written by a newer client,
 * or hand-edited) falls back to the raw id rather than rendering blank — a tile
 * whose period is unreadable is still better than a tile that looks unfiltered.
 * @param {string|null} id
 */
export function periodTokenLabel(id) {
  if (id === null || id === undefined) return periodTokenLabel(DEFAULT_PERIOD_TOKEN)
  return BY_ID.get(id)?.label ?? String(id)
}

/**
 * Token → the `BaseDateFilter` token object, or null when the window is the
 * server's own default.
 * @param {string|null} id
 * @returns {{ operator: 'relative', relative: object }|null}
 */
export function periodTokenToDateToken(id) {
  const entry = BY_ID.get(id ?? DEFAULT_PERIOD_TOKEN)
  if (!entry?.relative) return null
  return { operator: 'relative', relative: { ...entry.relative } }
}

/**
 * The reverse: a `BaseDateFilter` token → the storable token id, or null when
 * the window cannot be expressed as one.
 *
 * Null is the honest answer for an absolute range, and callers must treat it as
 * "this cannot be saved" rather than substituting the default — silently saving
 * a different period than the one on screen is the failure this whole module is
 * built to prevent.
 *
 * @param {object|null} token
 * @returns {string|null}
 */
export function periodTokenFromDateToken(token) {
  if (!token) return DEFAULT_PERIOD_TOKEN
  if (token.operator !== 'relative' || !token.relative) return null
  const { dir, unit, count } = token.relative
  const match = PERIOD_TOKENS.find(
    (t) =>
      t.relative &&
      t.relative.dir === dir &&
      t.relative.unit === unit &&
      // 'this' windows carry no count; treat a missing count as equal.
      (t.relative.count ?? null) === (count ?? null),
  )
  return match?.id ?? null
}

/**
 * Token → the `Date` arguments the metric functions take. Resolved AT CALL
 * TIME, which is what keeps a saved dashboard meaning "the last twelve months".
 *
 * @param {string|null} id
 * @param {import('luxon').DateTime} [now] injectable for deterministic tests
 * @returns {{ periodStart: string|null, periodEnd: string|null }}
 */
export function resolvePeriodToken(id, now) {
  const dateToken = periodTokenToDateToken(id)
  if (!dateToken) return { periodStart: null, periodEnd: null }
  return now ? periodFromDateToken(dateToken, now) : periodFromDateToken(dateToken)
}
