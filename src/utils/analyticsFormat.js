/**
 * Pure presentation rules for the analytics/metric layer. No Vue, no network —
 * so the semantics the backend is careful about are testable in isolation and
 * cannot drift between the KPI strip, a widget and an export.
 *
 * Three of these rules exist because getting them wrong produces a number that
 * is confidently WRONG rather than obviously missing:
 *
 *  1. `value === null && suppressed` is SMALL-CELL SUPPRESSION, not zero.
 *     Zero is itself information (see the analytics plan §5.3), so a suppressed
 *     cell must read as suppressed and never as 0 and never as a gap.
 *  2. `isSignificant === null` means NO VALID STATISTICAL TEST APPLIES (e.g. a
 *     count metric has no proportion to test). It is NOT "not significant" —
 *     so it renders no marker at all.
 *  3. A positive delta is only "good" once you know `direction`. Half the
 *     metrics in the catalog are `lower_is_better`; `neutral` metrics (volume
 *     counts like `capa.raised`) have no good direction at all.
 */
import { DateTime } from 'luxon'
import { resolveDateFilter } from '@/utils/dateRanges.js'

/** Decimal places per unit. `metric_catalog` exposes only `unit`, not the
 *  registry's `format.precision`, so these are the display defaults. */
export const METRIC_PRECISION = { percent: 1, days: 1, count: 0 }

/**
 * Suppressed cells render this instead of a number — never 0, never blank.
 * Wording matches BaseChart's own withheld-cell language so a chart, a
 * breakdown row and an export all say the same thing.
 */
export const SUPPRESSED_LABEL = 'Withheld'

export const SUPPRESSED_HELP =
  'Withheld to protect small groups: too few records to show without identifying them. This is not zero.'

/** `effective_scope` — the rows the SERVER counted for this viewer. */
export const SCOPE_LABEL = {
  own: 'My records',
  department: 'My department',
  site: 'My sites',
  tenant: 'Whole organization',
}

export const SCOPE_HELP = {
  own: 'Counted over records you own. Someone with wider access will legitimately see a different number.',
  department:
    'Counted over your department (plus anything you own elsewhere). Someone with wider access will legitimately see a different number.',
  site: 'Counted over your sites, your department and records you own. Someone with wider access will legitimately see a different number.',
  tenant: 'Counted over every record in the organization.',
}

/** Read tier — how fresh the number can possibly be. */
export const TIER_LABEL = { T1: 'Live', T2: 'Rollup', T3: 'Snapshot' }

export const TIER_HELP = {
  T1: 'Computed live from the records at the moment you asked.',
  T2: 'Computed from the pre-aggregated rollup, refreshed on a schedule — see the timestamp.',
  T3: 'Frozen at period close and never recomputed.',
}

/** Unit suffix used when the number stands alone. */
const UNIT_SUFFIX = { percent: '%', days: ' d', count: '' }

/**
 * Display name for an authz module id. There is no client-side registry of
 * module NAMES (only `moduleIcons.js`, which maps ids → icons; the names live
 * behind the `/v1/services/authz/catalog` RPC), so titleising the id covers
 * every module and this map only fixes the ones where that reads badly.
 * @param {string|null} moduleId
 */
export function moduleLabel(moduleId) {
  if (!moduleId) return 'All modules'
  const OVERRIDES = {
    capa: 'CAPA',
    ncr: 'Nonconformances',
    audit_findings: 'Audit Findings',
    audit_management: 'Audits',
    change_control: 'Change Control',
    document_control: 'Document Control',
    training_instances: 'Training',
    workflows_templates: 'Approvals',
  }
  if (OVERRIDES[moduleId]) return OVERRIDES[moduleId]
  return String(moduleId)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * GraphQL returns `numeric` as the `BigFloat` scalar, i.e. a STRING. Coerce
 * once, here, so nothing downstream does string arithmetic by accident.
 * @param {string|number|null|undefined} v
 * @returns {number|null}
 */
export function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Format a metric value for display.
 * @param {number|string|null} value
 * @param {string} unit  'percent' | 'count' | 'days'
 * @param {object} [options]
 * @param {boolean} [options.suppressed]  render SUPPRESSED_LABEL instead
 * @returns {string}
 */
export function formatMetricValue(value, unit, { suppressed = false } = {}) {
  if (suppressed) return SUPPRESSED_LABEL
  const n = toNumber(value)
  if (n === null) return '—'
  const precision = METRIC_PRECISION[unit] ?? 0
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}${UNIT_SUFFIX[unit] ?? ''}`
}

/**
 * Is this row suppressed for privacy? The backend's contract is a null value
 * WITH `suppressed: true` — a plain null (no rollup row) is a different thing
 * and renders as '—'.
 * @param {{ value?: any, suppressed?: boolean }} row
 */
export function isSuppressed(row) {
  return !!row?.suppressed
}

/**
 * Whether a positive delta is good, bad, or neither.
 * @param {number|null} delta      signed change (deltaAbs or deltaPct)
 * @param {string|null} direction  'lower_is_better' | 'higher_is_better' | 'neutral'
 * @returns {'good'|'bad'|'neutral'}
 */
export function deltaTone(delta, direction) {
  const n = toNumber(delta)
  if (n === null || n === 0) return 'neutral'
  // `neutral` is a real value in the registry (volume metrics like
  // `capa.raised` — more CAPAs is neither good nor bad), and an unknown
  // direction must not be guessed at either.
  if (direction !== 'lower_is_better' && direction !== 'higher_is_better') return 'neutral'
  const up = n > 0
  return (direction === 'higher_is_better') === up ? 'good' : 'bad'
}

/**
 * The arrow to draw for a delta. Purely which way the number MOVED — the
 * good/bad colouring is `deltaTone`'s job, because up ≠ good.
 * @param {number|null} delta
 * @returns {'up'|'down'|null}
 */
export function deltaDirection(delta) {
  const n = toNumber(delta)
  if (n === null || n === 0) return null
  return n > 0 ? 'up' : 'down'
}

/** Human label for the comparison basis a metric was asked for. */
export const COMPARE_LABEL = {
  previous_period: 'vs previous period',
  same_period_last_year: 'vs same period last year',
}

/**
 * Format the change line for a KPI, e.g. "+12.3% vs previous period".
 * Percent-unit metrics compare in percentage POINTS (deltaAbs), because a
 * "12% rise in a percentage" is ambiguous; everything else uses deltaPct.
 *
 * @param {object} row      a metricValue node
 * @param {string} compare  'previous_period' | 'same_period_last_year'
 * @returns {string|null}
 */
export function formatDelta(row, compare = 'previous_period') {
  if (!row) return null
  const usePoints = row.unit === 'percent'
  const raw = toNumber(usePoints ? row.deltaAbs : row.deltaPct)
  if (raw === null) return null
  const sign = raw > 0 ? '+' : ''
  const magnitude = `${sign}${raw.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${usePoints ? ' pts' : '%'}`
  return `${magnitude} ${COMPARE_LABEL[compare] ?? ''}`.trim()
}

/**
 * Significance marker text, or null when NO MARKER MAY BE DRAWN.
 *
 * `null` from the server = the test does not apply to this metric, which is
 * emphatically not the same as "tested and not significant". Only an explicit
 * boolean earns a marker.
 *
 * @param {boolean|null|undefined} isSignificant
 * @returns {{ label: string, help: string }|null}
 */
export function significanceMarker(isSignificant) {
  if (isSignificant === true) {
    return {
      label: 'Significant',
      help: 'The change passed a two-proportion test — unlikely to be noise.',
    }
  }
  if (isSignificant === false) {
    return {
      label: 'Not significant',
      help: 'The change did not pass a two-proportion test — treat it as noise.',
    }
  }
  return null
}

/**
 * Compact freshness label, e.g. "updated 12 minutes ago". `dt.formatDate()`
 * (CLAUDE.md #10) has no relative mode and freshness is only meaningful as an
 * age, so the relative string is the label and the exact stamp is the tooltip.
 *
 * @param {string|DateTime|null} computedAt
 * @returns {{ relative: string, exact: string }|null}
 */
export function formatFreshness(computedAt) {
  if (!computedAt) return null
  const dt = DateTime.isDateTime(computedAt) ? computedAt : DateTime.fromISO(String(computedAt))
  if (!dt.isValid) return null
  return { relative: dt.toRelative() ?? '', exact: dt.formatDate('datetime') }
}

/**
 * Turn a BaseDateFilter token (the same `{ operator, value, value2, relative }`
 * shape every list page already emits, so "Last 30 days" re-resolves at run
 * time rather than freezing to the day it was saved) into the `Date` arguments
 * `metric_value` / `metric_series` / `metric_breakdown` take.
 *
 * @param {object|null} token
 * @param {DateTime} [now]
 * @returns {{ periodStart: string|null, periodEnd: string|null }}
 */
export function periodFromDateToken(token, now = DateTime.now()) {
  const { start, end } = resolveDateFilter(token, now)
  return {
    periodStart: start?.isValid ? start.toISODate() : null,
    periodEnd: end?.isValid ? end.toISODate() : null,
  }
}

/**
 * Human label for the resolved window, for the tile footer and the export
 * filename ("1 Jul 2026 – 31 Jul 2026").
 * @param {string|null} periodStart ISO date
 * @param {string|null} periodEnd   ISO date
 */
export function formatPeriod(periodStart, periodEnd) {
  const a = periodStart ? DateTime.fromISO(periodStart) : null
  const b = periodEnd ? DateTime.fromISO(periodEnd) : null
  if (a?.isValid && b?.isValid) return `${a.formatDate('date')} – ${b.formatDate('date')}`
  if (a?.isValid) return `from ${a.formatDate('date')}`
  if (b?.isValid) return `until ${b.formatDate('date')}`
  return 'Default period'
}

/**
 * A breakdown row's residual bucket ("Other (3, 1 below threshold)") is a
 * SUMMARY of rows the viewer is not being shown individually. It carries a
 * null `dimensionValue` and null drill target on purpose and must never be
 * offered as a drillable segment.
 * @param {{ isResidual?: boolean, drillRoute?: string|null }} row
 */
export function isDrillable(row) {
  return !!row?.drillRoute && !row?.isResidual
}

/**
 * Build the router location for a breakdown row's drill-through: the metric's
 * own route plus the filters the server computed for that exact segment, so the
 * leaf list shows the records the number came from.
 * @param {{ drillRoute?: string|null, drillFilters?: object|null }} row
 * @returns {{ path: string, query: Record<string, string> }|null}
 */
export function drillLocation(row) {
  if (!isDrillable(row)) return null
  const query = {}
  for (const [key, value] of Object.entries(row.drillFilters || {})) {
    if (value === null || value === undefined || value === '') continue
    query[key] = Array.isArray(value) ? value.join(',') : String(value)
  }
  return { path: row.drillRoute, query }
}
