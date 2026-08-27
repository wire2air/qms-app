/**
 * The vocabulary and shape of an `analytics_alerts` threshold ladder — the
 * CLIENT MIRROR of `public.analytics_alert_bands_valid()`.
 *
 * ── WHY A MIRROR AND NOT A HAND-WRITTEN LIST ────────────────────────────────
 * `analytics_alerts_bands_chk` calls that function and it FAILS CLOSED: an
 * unknown comparator, severity or period token is not coerced, defaulted or
 * warned about — the whole INSERT is refused, and the user sees a bare
 * constraint name. So every select below is driven from the same enumerations
 * the function tests, read off the live database rather than remembered:
 *
 *   comparator  gt | gte | lt | lte          (negation is deliberately absent —
 *                                             see the runner's header: `!=`
 *                                             against an unresolved metric is
 *                                             TRUE, so "alert me when closure
 *                                             rate is not 100%" fired every
 *                                             tick on a metric that failed to
 *                                             resolve)
 *   severity    info | warning | critical
 *   window      the period tokens, and NOTHING else
 *
 * The window list is the sharpest of the three and it is NOT restated here. It
 * comes from `PERIOD_TOKEN_OPTIONS`, because a token this layer does not
 * recognise is the one failure that is not loud: `analytics_resolve_period_token()`
 * maps anything unknown to `(NULL, NULL)`, i.e. the server's default window, so
 * a typo would not error — it would quietly widen the alert into a different
 * alert. The CHECK is the backstop; offering only the canonical list is what
 * stops anybody reaching it.
 *
 * ── FILTERS ARE NOT EDITABLE, ANYWHERE ──────────────────────────────────────
 * `analytics_alerts.filters` exists in the schema and `evaluate_analytics_alerts`
 * REFUSES to evaluate any alert whose filters are non-empty: no metric executor
 * takes a filter argument, and evaluating the unfiltered metric would silently
 * make it a broader alert than the one that was saved. There is therefore no
 * filters editor in this feature and no helper for one here. `alertHasFilters()`
 * exists only to SAY SO on a row that already carries them, because such an
 * alert looks active and never fires.
 *
 * ── AND THE ACCESS HELPERS ARE NOT THE ENFORCEMENT ──────────────────────────
 * Same rule as `analyticsDashboardAccess.js`: RLS decides, these decide which
 * controls to draw. If the two disagree the server wins and the symptom is a
 * missing button, never a leak.
 */
import { PERIOD_TOKEN_OPTIONS, isPeriodToken, periodTokenLabel } from '@/utils/analyticsPeriods.js'

/**
 * `analytics_alert_bands_valid()`:
 *   IF COALESCE(v_band ->> 'comparator', '') NOT IN ('gt','gte','lt','lte')
 *
 * Labels read as the sentence the band actually makes — "Open CAPAs is above
 * 20" — because "gt" on a form is a database detail leaking onto a screen.
 */
export const COMPARATORS = [
  { value: 'gt', label: 'is above', symbol: '>' },
  { value: 'gte', label: 'is at or above', symbol: '≥' },
  { value: 'lt', label: 'is below', symbol: '<' },
  { value: 'lte', label: 'is at or below', symbol: '≤' },
]

const COMPARATOR_BY_VALUE = new Map(COMPARATORS.map((c) => [c.value, c]))

/**
 * `IF COALESCE(v_band ->> 'severity', '') NOT IN ('info','warning','critical')`
 *
 * `rank` is the runner's SEVERITY_RANK: every band a recipient is on is
 * evaluated and only the MOST SEVERE crossed band fires, so the ladder is
 * ordered by this and not by the order somebody typed the rows in.
 * `badgeClass` follows the house severity palette (see NcSeverityBadge).
 */
export const SEVERITIES = [
  {
    value: 'info',
    label: 'Info',
    rank: 1,
    badgeClass: 'tw:bg-blue-100 tw:text-blue-700',
  },
  {
    value: 'warning',
    label: 'Warning',
    rank: 2,
    badgeClass: 'tw:bg-amber-100 tw:text-amber-700',
  },
  {
    value: 'critical',
    label: 'Critical',
    rank: 3,
    badgeClass: 'tw:bg-red-100 tw:text-red-700',
  },
]

const SEVERITY_BY_VALUE = new Map(SEVERITIES.map((s) => [s.value, s]))

/** Options for a `BaseSelect`. */
export const COMPARATOR_OPTIONS = COMPARATORS.map((c) => ({ value: c.value, label: c.label }))
export const SEVERITY_OPTIONS = SEVERITIES.map((s) => ({ value: s.value, label: s.label }))

/**
 * A band's window is a PERIOD TOKEN, re-exported rather than restated so this
 * select and the widget builder's cannot drift apart. See the header.
 */
export const BAND_WINDOW_OPTIONS = PERIOD_TOKEN_OPTIONS

/** `IF v_count < 1 OR v_count > 10 THEN RETURN false` */
export const MIN_BANDS = 1
export const MAX_BANDS = 10

/**
 * `IF v_mins < 1 OR v_mins > 43200 OR v_mins <> floor(v_mins)`, and
 * `analytics_alerts_suppress_chk` on the alert-level column. 0 is excluded
 * because it produces an EMPTY tstzrange, an empty range overlaps nothing, the
 * exclusion constraint would accept every insert, and the alert would mail on
 * every tick.
 */
export const SUPPRESS_MIN_MINUTES = 1
export const SUPPRESS_MAX_MINUTES = 43200
/** The column default. */
export const DEFAULT_SUPPRESS_WINDOW_MINUTES = 1440

/** The default a new band starts from — the same window the rest of analytics defaults to. */
export const DEFAULT_BAND_WINDOW = 'last_12_months'

/**
 * A band key, generated ONCE and never rewritten.
 *
 * The key is the suppression key: `analytics_alert_events_suppression_excl`
 * ranges over (alert, recipient, band_key, slice), and every event snapshots it.
 * So it is deliberately NOT derived from the band's position or its severity —
 * renumbering on delete, or re-slugging when somebody promotes a warning to a
 * critical, would hand a live band the suppression window and the history of a
 * different one. It is not editable in the builder for the same reason.
 */
export function newBandKey() {
  return `b${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/** A new, empty band for the editor. Not yet valid — it has no threshold. */
export function blankBand(overrides = {}) {
  return {
    key: newBandKey(),
    comparator: 'gt',
    // Held as a STRING while editing (a number input hands back a string, and
    // a half-typed "-" is not a number). Coerced in normaliseBands().
    threshold: '',
    window: DEFAULT_BAND_WINDOW,
    severity: 'warning',
    recipients: [],
    // '' means "use the alert's default". Omitted entirely on save rather than
    // written as null: the CHECK tests `jsonb_exists(band,'suppressWindowMinutes')`
    // and then demands a number, so a null would fail the whole ladder.
    suppressWindowMinutes: '',
    ...overrides,
  }
}

function toFiniteNumber(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Editor draft -> the jsonb `analytics_alerts.bands` actually stores.
 *
 * Called once at the save boundary, never per keystroke: the ladder is written
 * WHOLE and the CHECK reads it whole, so a partially coerced band is not a
 * state worth having.
 */
export function normaliseBands(draftBands) {
  return (draftBands ?? []).map((b) => {
    const band = {
      key: String(b?.key ?? '').trim(),
      comparator: b?.comparator,
      threshold: toFiniteNumber(b?.threshold),
      window: b?.window,
      severity: b?.severity,
      // Plain uuid STRINGS. Not `{ type, id }` objects and not addresses —
      // see recipientProblems() below for why neither is representable.
      recipients: (b?.recipients ?? []).map((r) => String(r)).filter(Boolean),
    }
    const minutes = toFiniteNumber(b?.suppressWindowMinutes)
    if (minutes !== null) band.suppressWindowMinutes = minutes
    return band
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Everything `analytics_alert_bands_valid()` would refuse, as sentences.
 *
 * Restated on the client for ONE reason: the CHECK returns false rather than
 * raising, so a bad ladder surfaces as `violates check constraint
 * "analytics_alerts_bands_chk"` with no indication of WHICH band or WHICH
 * field. Every branch below has a `RETURN false` behind it; none of them is a
 * house style rule.
 *
 * @param {Array} bands already through normaliseBands()
 * @returns {string[]} empty when the ladder would be accepted
 */
export function bandProblems(bands) {
  const problems = []
  const list = Array.isArray(bands) ? bands : []

  if (list.length < MIN_BANDS) {
    problems.push('Add at least one band — an alert with no bands never notifies anybody.')
  }
  if (list.length > MAX_BANDS) {
    problems.push(`An alert can have at most ${MAX_BANDS} bands.`)
  }

  const seen = new Set()
  list.forEach((band, i) => {
    const where = `Band ${i + 1}`
    const key = String(band?.key ?? '').trim()

    if (!key) {
      problems.push(`${where} has no key.`)
    } else if (seen.has(key)) {
      // Two bands sharing a key share one suppression window, so one of them
      // silently stops firing.
      problems.push(`${where} repeats the key of an earlier band.`)
    }
    seen.add(key)

    if (!COMPARATOR_BY_VALUE.has(band?.comparator)) {
      problems.push(`${where} needs a comparator.`)
    }
    if (typeof band?.threshold !== 'number' || !Number.isFinite(band.threshold)) {
      problems.push(`${where} needs a numeric threshold.`)
    }
    if (!SEVERITY_BY_VALUE.has(band?.severity)) {
      problems.push(`${where} needs a severity.`)
    }
    if (!isPeriodToken(band?.window)) {
      problems.push(`${where} needs a time window from the list.`)
    }
    if (Object.prototype.hasOwnProperty.call(band ?? {}, 'suppressWindowMinutes')) {
      const m = band.suppressWindowMinutes
      if (
        typeof m !== 'number' ||
        !Number.isInteger(m) ||
        m < SUPPRESS_MIN_MINUTES ||
        m > SUPPRESS_MAX_MINUTES
      ) {
        problems.push(
          `${where}: repeat-after must be a whole number of minutes between ` +
            `${SUPPRESS_MIN_MINUTES} and ${SUPPRESS_MAX_MINUTES}.`,
        )
      }
    }
    problems.push(...recipientProblems(band?.recipients, where))
  })

  return problems
}

/**
 * Recipients are USER IDS. Never addresses, and never `{ type, id }` objects.
 *
 * The CHECK requires every element to be a jsonb STRING matching the uuid
 * shape, so an address fails the regex and an object fails `jsonb_typeof`. That
 * is the schema making a stale permission decision unrepresentable: an address
 * is a decision frozen on the day it was typed and it keeps sending after the
 * decision stops being true, whereas a user id is re-resolved and re-authorised
 * at send time.
 *
 * It also rules out team and role recipients, which is easy to miss because a
 * team id IS uuid-shaped and would store cleanly. It would never notify anybody:
 * `analytics_record_alert_fire()` requires the SESSION USER to be in
 * `analytics_alert_recipients()`, and the runner iterates that same array
 * setting `app.current_user_id` to each entry. A team id there is a recipient
 * who never resolves and never fires — silently. Hence: people only.
 */
export function recipientProblems(recipients, where = 'Recipients') {
  if (!Array.isArray(recipients)) return [`${where}: recipients must be a list.`]
  return recipients.some((r) => typeof r !== 'string' || !UUID_RE.test(r))
    ? [`${where}: every recipient must be a person chosen from the list.`]
    : []
}

/**
 * `public.analytics_alert_recipients(recipients, bands)` — the union of the
 * base list with every band's, which is what escalation means: a higher band
 * ADDS people, it never drops the person who has been watching all along.
 *
 * The RLS policies and the fire recorder call the SQL function; this is the
 * client's copy for deciding what to draw. Kept to one definition here for the
 * same reason the database keeps it to one there.
 *
 * @param {{ recipients?: string[], bands?: Array }|null} alert
 * @returns {string[]}
 */
export function effectiveRecipients(alert) {
  const out = new Set()
  for (const r of alert?.recipients ?? []) if (r) out.add(String(r))
  for (const band of alert?.bands ?? []) {
    for (const r of band?.recipients ?? []) if (r) out.add(String(r))
  }
  return [...out]
}

/** `is above` / `≥` for the given comparator. */
export function comparatorLabel(value) {
  return COMPARATOR_BY_VALUE.get(value)?.label ?? String(value ?? '')
}

export function comparatorSymbol(value) {
  return COMPARATOR_BY_VALUE.get(value)?.symbol ?? ''
}

export function severityLabel(value) {
  return SEVERITY_BY_VALUE.get(value)?.label ?? String(value ?? '')
}

export function severityBadgeClass(value) {
  return SEVERITY_BY_VALUE.get(value)?.badgeClass ?? 'tw:bg-gray-100 tw:text-gray-600'
}

export function severityRank(value) {
  return SEVERITY_BY_VALUE.get(value)?.rank ?? 0
}

/**
 * One band as a sentence — "Critical when the value is above 50 over the last
 * 90 days". Used on the list row and in the event history, where the SNAPSHOT
 * is what must be read back rather than the alert's current ladder.
 */
export function describeBand(band) {
  if (!band) return ''
  const threshold = band.threshold ?? band.thresholdValue
  return (
    `${severityLabel(band.severity)} when the value ` +
    `${comparatorLabel(band.comparator)} ${threshold ?? '—'} ` +
    `over ${periodTokenLabel(band.window ?? band.windowToken).toLowerCase()}`
  )
}

/** "24 hours" / "90 minutes" / "3 days" — a suppression window a person can read. */
export function formatMinutes(minutes) {
  const m = toFiniteNumber(minutes)
  if (m === null) return '—'
  if (m % 1440 === 0) {
    const days = m / 1440
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (m % 60 === 0) {
    const hours = m / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`
}

/**
 * Does this row carry filters the runner will refuse to evaluate?
 *
 * There is no editor that can produce this — see the header — so a `true` here
 * means a row written before this UI existed, or by hand. It is worth saying
 * out loud because such an alert reads as active and never fires.
 */
export function alertHasFilters(alert) {
  const filters = alert?.filters
  return !!filters && typeof filters === 'object' && Object.keys(filters).length > 0
}

// ── access mirrors ──────────────────────────────────────────────────────────
// analytics_alerts_{update,delete}_rls, restated. Pass `canManage` as
// isAllowed(['reports_dashboards:manage']) — that helper already returns true
// for a company owner, which is the `current_user_is_owner` branch of the SQL.

/**
 * UPDATE USING: owner_id = me OR is_owner OR manage.
 *
 * @param {{ ownerId?: string }|null} alert
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canEditAlert(alert, { userId = null, canManage = false } = {}) {
  if (!alert) return false
  if (canManage) return true
  return !!userId && alert.ownerId === userId
}

/**
 * UPDATE's USING **and** its WITH CHECK, which are different predicates and
 * both have to hold.
 *
 *   USING       owner_id = me OR is_owner OR manage
 *   WITH CHECK  is_owner OR manage OR recipients(...) <@ ARRAY[me]
 *
 * So an owner WITHOUT `manage` can still edit their own alert — but only while
 * it notifies nobody but them. Drawing Edit on their colleague-notifying alert
 * would open a dialog whose every save is refused, which reads as the form
 * being broken rather than as a permission they do not have.
 *
 * @param {{ ownerId?: string, recipients?: string[], bands?: Array }|null} alert
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canUpdateAlert(alert, viewer = {}) {
  if (!canEditAlert(alert, viewer)) return false
  if (viewer.canManage) return true
  return effectiveRecipients(alert).every((r) => r === viewer.userId)
}

/** DELETE USING is the same predicate — there is no is_system column here. */
export function canDeleteAlert(alert, viewer = {}) {
  return canEditAlert(alert, viewer)
}

/**
 * The seam the write policies are actually split on, and the reason this is a
 * separate question from `canEditAlert`.
 *
 * Both INSERT's WITH CHECK and UPDATE's WITH CHECK end with:
 *
 *   is_owner OR has_permission('reports_dashboards','manage')
 *   OR analytics_alert_recipients(recipients, bands) <@ ARRAY[me]
 *
 * i.e. anybody may create or edit an alert that mails ONLY THEM; naming
 * somebody else is what needs `manage`. An alert is the only object in this
 * layer that puts mail in another person's inbox, so that is where the line is
 * drawn — not at "editing is more privileged than reading".
 *
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canNameOtherRecipients({ canManage = false } = {}) {
  return !!canManage
}

/**
 * The union, restricted to what this viewer is allowed to save.
 *
 * Not a security check — the WITH CHECK is. It exists so a viewer without
 * `manage` cannot assemble a draft the database is going to refuse: their
 * pickers are not drawn at all, and this pins the payload to match.
 *
 * @param {string[]} recipients
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function clampRecipients(recipients, { userId = null, canManage = false } = {}) {
  if (canManage) return [...new Set((recipients ?? []).filter(Boolean).map(String))]
  return userId ? [userId] : []
}
