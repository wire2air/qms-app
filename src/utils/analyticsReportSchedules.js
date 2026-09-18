/**
 * Report-schedule rules, CLIENT SIDE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS FILE AND `qms/backend/api/schemas/analyticsReportSchedules.js` ARE COPIES.
 * ══════════════════════════════════════════════════════════════════════════════
 * They are two implementations of one rule set, kept deliberately apart rather
 * than shared, because the backend module imports `cron-parser` and `zod` — both
 * server-only dependencies this bundle does not carry — and because the two
 * answer different questions at different moments:
 *
 *   backend  — is this string acceptable? (authority; returns 400)
 *   here     — should this control be enabled, and what is the author actually
 *              asking for? (affordance; returns a preview and a disabled button)
 *
 * NOTHING HERE IS THE ENFORCEMENT. The real gates, in order of authority:
 *
 *   CHECK ..._cron_shape_chk       — 5 whitespace-separated fields from the cron
 *                                    alphabet, length 9–200. Fires on EVERY write
 *                                    path (GraphQL, SyncEngine, psql, worker).
 *   BEFORE trigger                 — the timezone must exist in pg_timezone_names.
 *   CHECK ..._recipients_chk       — every element is {type,id} and NOTHING else.
 *   CHECK ..._active_recipients_chk— an active schedule has ≥ 1 recipient.
 *   RLS INSERT/UPDATE WITH CHECK   — is_active = false OR reports_dashboards:export.
 *   backend Zod schema             — the expression actually PARSES.
 *
 * If this file and any of those disagree, they win and the symptom is a button
 * that refuses locally or a server error the user can read — never a leak. Keep
 * the two in step: a rule loosened here that is still tight there produces a
 * confusing 500; a rule tightened here that is loose there merely blocks
 * something legal, which is the safer direction and the one to err in.
 *
 * ── WHY THE CRON MATH IS RE-IMPLEMENTED RATHER THAN IMPORTED ────────────────
 * `cron-parser` is not a frontend dependency and adding one to draw three
 * timestamps is not a trade worth making. What is implemented below is the plain
 * five-field (Vixie) grammar — `*`, lists, ranges, steps, and the three-letter
 * month/day names — which is everything `CronPicker` can emit and everything the
 * presets use. Extended syntax the parser also accepts (`#`, `L`, `W`) is
 * explicitly NOT modelled, and the honest consequence is declared rather than
 * guessed at: such an expression is passed through as VALID with no preview,
 * because refusing it here would block something the server would have accepted.
 */
import { DateTime } from 'luxon'

/** Mirrors RECIPIENT_TYPES in the backend schema and the DB key whitelist. */
export const RECIPIENT_TYPES = ['user', 'team', 'role']

/**
 * The two formats `request_report_export` can produce. A schedule offering a
 * third would save fine and fail only at send time, months later.
 */
export const SCHEDULE_FORMATS = ['pdf', 'xlsx']

export const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
]

/** analytics_report_runs.status — CHECK-constrained to exactly these. */
export const RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED']

export const RUN_STATUS_LABEL = {
  RUNNING: 'Running',
  SUCCEEDED: 'Delivered',
  PARTIAL: 'Partly delivered',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
}

/**
 * What each status actually claims. PARTIAL is the one worth spelling out: it is
 * the normal, healthy outcome when somebody on the list has lost export access,
 * not a malfunction — and it is the only place Phase 8's exit criterion ("a
 * recipient who loses access stops receiving on the next run") is observable at
 * all, because it is invisible in an email that does not arrive.
 */
export const RUN_STATUS_HELP = {
  RUNNING: 'Started and not finished yet. A run stuck here for hours is a stall worth reporting.',
  SUCCEEDED: 'Every resolved recipient was sent their own copy.',
  PARTIAL:
    'Some recipients were sent their copy and some were not — usually because they no longer hold export access. Check the denied and failed counts.',
  FAILED: 'Nothing was sent. The reason is recorded on the run.',
  SKIPPED:
    'The occurrence was passed over — typically because the schedule resolved to nobody, or the report was no longer readable.',
}

/**
 * FIVE. Asserted before the expression is parsed, on purpose: a six-field
 * expression is read by cron-parser as carrying a leading SECONDS field, so
 * `0 0 6 * * 1` parses happily and means something entirely different from what
 * almost anyone typing it intended. A parser that accepts your mistake is worse
 * than one that rejects it, and the DB CHECK refuses six fields for the same
 * reason.
 */
export const CRON_FIELD_COUNT = 5

/** Zod caps the list at 200; past that a "schedule" is a mailing list. */
export const MAX_RECIPIENTS = 200

/**
 * Mirrors `analytics_report_schedules_cron_shape_chk`. Note the alphabet
 * excludes `?` — cron-parser accepts it as a Quartz-flavoured alias for `*`, and
 * admitting two spellings of "any" costs every reader a moment of doubt and buys
 * nothing. A shape gate narrower than the parser can only reject something that
 * would have worked; it can never accept something that will not.
 */
const CRON_SHAPE_RE = /^\s*[A-Za-z0-9*/,#-]+(\s+[A-Za-z0-9*/,#-]+){4}\s*$/

/** Extended syntax this module knowingly does not model — see the header. */
const EXTENDED_TOKENS = /[#]|(^|[^A-Za-z])[LW]([^A-Za-z]|$)/i

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const FIELD_LABELS = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week']

/**
 * Is this an IANA zone the RUNTIME can resolve? The browser counterpart of the
 * BEFORE trigger's pg_timezone_names lookup. Intl throws RangeError on an
 * unknown zone, which is the only reliable way to ask.
 */
export function isValidTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() })
    return true
  } catch {
    return false
  }
}

/**
 * Every zone this runtime knows, for the picker. `Intl.supportedValuesOf` is the
 * only way to enumerate them and is not universal, so the fallback is a short
 * curated list plus whatever the browser reports as local — a picker that cannot
 * offer the user's own zone is worse than a short one.
 */
export function timezoneOptions() {
  let zones = []
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      zones = Intl.supportedValuesOf('timeZone')
    }
  } catch {
    zones = []
  }
  if (!zones.length) {
    zones = [
      'UTC',
      'Europe/London',
      'Europe/Dublin',
      'Europe/Paris',
      'Europe/Berlin',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
    ]
  }
  const local = localTimezone()
  const all = new Set(['UTC', local, ...zones].filter(Boolean))
  return [...all].sort().map(function toOption(z) {
    return { value: z, label: z === local ? `${z} (your timezone)` : z }
  })
}

/** The browser's own zone, or UTC when it will not say. */
export function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Named alias → number, for MON/JAN style fields. */
function tokenToNumber(raw, names) {
  const token = String(raw ?? '').trim()
  if (token === '') return null
  if (/^\d+$/.test(token)) return parseInt(token, 10)
  if (!names) return null
  const index = names.indexOf(token.toUpperCase())
  return index === -1 ? null : index
}

/**
 * One cron field → the set of values it matches.
 * @returns {{ set: Set<number>, any: boolean }|null} null when unparseable.
 */
function parseField(raw, min, max, names) {
  const spec = String(raw ?? '').trim()
  if (!spec) return null
  const set = new Set()
  for (const part of spec.split(',')) {
    const slashed = part.split('/')
    if (slashed.length > 2) return null
    const [rangePart, stepPart] = slashed
    let step = 1
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) return null
      step = parseInt(stepPart, 10)
      if (step < 1) return null
    }
    let lo
    let hi
    if (rangePart === '*') {
      lo = min
      hi = max
    } else if (rangePart.includes('-')) {
      const bounds = rangePart.split('-')
      if (bounds.length !== 2) return null
      lo = tokenToNumber(bounds[0], names)
      hi = tokenToNumber(bounds[1], names)
    } else {
      lo = tokenToNumber(rangePart, names)
      // `5/10` means "from 5, every 10" — a bare value with a step is a range to
      // the end of the field, not a single value.
      hi = stepPart === undefined ? lo : max
    }
    if (lo == null || hi == null) return null
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) set.add(v)
  }
  return { set, any: spec === '*' }
}

/**
 * Parse a five-field expression into matchable sets.
 * @returns {{ ok: true, spec: object }|{ ok: false, reason: string }}
 */
function parseCron(cron) {
  const fields = String(cron ?? '').trim().split(/\s+/)
  const minute = parseField(fields[0], 0, 59, null)
  const hour = parseField(fields[1], 0, 23, null)
  const dom = parseField(fields[2], 1, 31, null)
  const month = parseField(fields[3], 1, 12, MONTH_NAMES)
  // 7 is a second spelling of Sunday; normalised below so matching has one form.
  const dow = parseField(fields[4], 0, 7, DOW_NAMES)

  const parsed = [minute, hour, dom, month, dow]
  const badIndex = parsed.findIndex(function isBad(p) {
    return p === null
  })
  if (badIndex !== -1) {
    return {
      ok: false,
      reason: `The ${FIELD_LABELS[badIndex]} field ("${fields[badIndex]}") is not a value this field accepts.`,
    }
  }

  if (dow.set.has(7)) dow.set.add(0)
  dow.set.delete(7)

  return { ok: true, spec: { minute, hour, dom, month, dow } }
}

/**
 * The check the DATABASE cannot make — a CHECK constraint has no way to know
 * that minute 61 does not exist or that day-of-week 9 never matches.
 *
 * Returns `{ ok, reason, previewable }` rather than throwing, so one call can
 * drive both the inline error and whether to attempt a preview.
 *
 * `previewable: false` with `ok: true` is the deliberate middle state: the
 * expression uses syntax cron-parser supports and this module does not model
 * (`#`, `L`, `W`), so blocking it would refuse something the server accepts.
 */
export function checkCron(cron, timezone = 'UTC') {
  if (typeof cron !== 'string' || !cron.trim()) {
    return { ok: false, reason: 'A schedule needs a cron expression.', previewable: false }
  }
  const trimmed = cron.trim()

  const fields = trimmed.split(/\s+/)
  if (fields.length !== CRON_FIELD_COUNT) {
    return {
      ok: false,
      reason:
        fields.length === CRON_FIELD_COUNT + 1
          ? 'Six fields would be read as a leading SECONDS field and would not mean what it looks like. Use five: minute hour day-of-month month day-of-week.'
          : `Expected ${CRON_FIELD_COUNT} fields (minute hour day-of-month month day-of-week), got ${fields.length}.`,
      previewable: false,
    }
  }

  // Mirrors the DB CHECK, so prose ("every monday at nine") is refused here with
  // a sentence rather than there with a constraint name.
  if (trimmed.length < 9 || trimmed.length > 200 || !CRON_SHAPE_RE.test(trimmed)) {
    return {
      ok: false,
      reason:
        'That is not a cron expression. Use five fields of numbers, names, * , - and / — for example "0 8 * * MON" for Mondays at 08:00.',
      previewable: false,
    }
  }

  if (!isValidTimezone(timezone)) {
    return {
      ok: false,
      reason: `Unknown timezone: ${timezone}. Use an IANA name such as Europe/London — an abbreviation like GMT carries no daylight-saving rule.`,
      previewable: false,
    }
  }

  const parsed = parseCron(trimmed)
  if (!parsed.ok) {
    // Extended syntax: valid to the server, opaque to this module. Say so
    // instead of refusing it — see the header.
    if (EXTENDED_TOKENS.test(trimmed)) {
      return {
        ok: true,
        reason:
          'This uses extended cron syntax, so the next run times cannot be previewed here. The server validates it on save.',
        previewable: false,
      }
    }
    return { ok: false, reason: parsed.reason, previewable: false }
  }

  return { ok: true, reason: null, previewable: true }
}

/** Does this instant satisfy the day fields? */
function matchesDay(spec, when) {
  const domRestricted = !spec.dom.any
  const dowRestricted = !spec.dow.any
  const domHit = spec.dom.set.has(when.day)
  // luxon weekday is 1=Mon … 7=Sun; cron is 0=Sun … 6=Sat.
  const dowHit = spec.dow.set.has(when.weekday === 7 ? 0 : when.weekday)
  // Vixie's OR rule: when BOTH day fields are restricted the expression matches
  // either one. `0 9 1 * MON` is the 1st AND every Monday, not "Mondays that
  // fall on the 1st" — getting this backwards silently halves or multiplies how
  // often a report goes out.
  if (domRestricted && dowRestricted) return domHit || dowHit
  if (domRestricted) return domHit
  if (dowRestricted) return dowHit
  return true
}

/**
 * The next `count` firings, as DateTimes IN THE SCHEDULE'S OWN ZONE.
 *
 * The zone is not cosmetic. "Every Monday at 09:00" means the TENANT's Monday,
 * and the UTC instant that corresponds to moves by an hour across a DST
 * boundary while the wall clock does not — which is exactly why each occurrence
 * is re-derived from the expression rather than computed as "previous + 7 days".
 * Showing these is the only way an author can see what they actually asked for
 * before it starts mailing people every week for a year.
 *
 * Returns [] when the expression cannot be modelled or genuinely never fires
 * (`0 0 30 2 *` — 30 February). "Never" is a real answer and the UI says so.
 *
 * @param {string} cron
 * @param {string} timezone IANA name
 * @param {number} count
 * @param {DateTime} [from]
 * @returns {DateTime[]}
 */
export function nextRunTimes(cron, timezone = 'UTC', count = 3, from = DateTime.now()) {
  const zone = isValidTimezone(timezone) ? timezone.trim() : 'UTC'
  const parsed = parseCron(String(cron ?? '').trim())
  if (!parsed.ok) return []
  if (String(cron ?? '').trim().split(/\s+/).length !== CRON_FIELD_COUNT) return []

  const spec = parsed.spec
  let cursor = from.setZone(zone)
  if (!cursor.isValid) return []
  cursor = cursor.startOf('minute').plus({ minutes: 1 })

  // Horizon rather than an iteration count: the loop skips whole months and days
  // when they cannot match, so the bound that matters is calendar reach. Five
  // years is past any real schedule and short enough that "never fires" returns
  // promptly instead of hanging the dialog.
  const horizon = cursor.plus({ years: 5 })
  const out = []

  while (out.length < count && cursor < horizon) {
    if (!spec.month.set.has(cursor.month)) {
      cursor = cursor.plus({ months: 1 }).startOf('month')
      continue
    }
    if (!matchesDay(spec, cursor)) {
      cursor = cursor.plus({ days: 1 }).startOf('day')
      continue
    }
    if (!spec.hour.set.has(cursor.hour)) {
      cursor = cursor.plus({ hours: 1 }).startOf('hour')
      continue
    }
    if (!spec.minute.set.has(cursor.minute)) {
      cursor = cursor.plus({ minutes: 1 })
      continue
    }
    out.push(cursor)
    cursor = cursor.plus({ minutes: 1 })
  }

  return out
}

// ── recipients ──────────────────────────────────────────────────────────────

/**
 * Coerce whatever the picker produced into the ONLY shape the CHECK constraint
 * accepts: `{ type, id }` and nothing else.
 *
 * `.strict()` is load-bearing on the backend for the same reason this rebuild is
 * here rather than a spread: it is what makes `{ type, id, email }` a validation
 * error instead of a stored copy of somebody's mailbox. An address is a snapshot
 * of an authorisation decision and keeps asserting it after the person has lost
 * access; a reference can be re-asked at send time, and is. Building the object
 * key by key means a stray field cannot survive an edit round trip.
 *
 * Duplicates are dropped — they are not a constraint violation, they are
 * duplicate emails.
 */
export function normaliseRecipients(recipients) {
  const seen = new Set()
  const out = []
  for (const entry of Array.isArray(recipients) ? recipients : []) {
    const type = String(entry?.type ?? '')
    const id = String(entry?.id ?? '')
    if (!RECIPIENT_TYPES.includes(type) || !id) continue
    const key = `${type}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ type, id })
  }
  return out.slice(0, MAX_RECIPIENTS)
}

/** The ids of one reference type, for binding a single picker. */
export function recipientIdsOfType(recipients, type) {
  return normaliseRecipients(recipients)
    .filter(function ofType(r) {
      return r.type === type
    })
    .map(function toId(r) {
      return r.id
    })
}

/** Replace one type's ids wholesale, preserving the other two types' order. */
export function withRecipientIdsOfType(recipients, type, ids) {
  const kept = normaliseRecipients(recipients).filter(function notThisType(r) {
    return r.type !== type
  })
  const added = (Array.isArray(ids) ? ids : []).map(function toRef(id) {
    return { type, id: String(id) }
  })
  return normaliseRecipients([...kept, ...added])
}

// ── who may do what (a MIRROR of RLS, never the enforcement) ────────────────

/**
 * May this viewer change the schedule at all? Mirrors
 * `analytics_report_schedules_update_rls`'s USING clause: owner, company owner,
 * or `reports_dashboards:manage`.
 *
 * `isAllowed(['reports_dashboards:manage'])` already returns true for a company
 * owner (currentSession.isOwner short-circuits it), so the owner branch of the
 * SQL needs no separate test — pass its result as `canManage`.
 */
export function canEditSchedule(schedule, { userId = null, canManage = false } = {}) {
  if (!schedule) return false
  if (canManage) return true
  return !!userId && schedule.ownerId === userId
}

/**
 * May this viewer turn the schedule ON?
 *
 * `reports_dashboards:EXPORT`, not manage — and the distinction is a hole rather
 * than a nicety. A live schedule mails figures out of the system on a timer,
 * with nobody watching, to other people: it IS an export. If activation required
 * only manage, somebody holding manage but not export — an ordinary combination,
 * since manage curates definitions and export governs data leaving — could name
 * themselves the sole recipient of a weekly send and receive by email precisely
 * the file `request_report_export` refuses to hand them. The scheduler would be
 * a bypass of the export gate, reachable through the product's own UI.
 *
 * There is no company-owner short-circuit here, deliberately, and the RLS has
 * none either: `request_report_export` requires `:export` of everybody including
 * the owner, and the two egress paths must agree. A rule that holds for the
 * download button and not for the mail schedule is not a rule. So this takes an
 * explicit `canExport` rather than reusing `canManage`.
 */
export function canActivateSchedule({ canExport = false } = {}) {
  return !!canExport
}

/**
 * May this viewer turn the schedule OFF? Yes, whenever they may edit it at all.
 *
 * The RLS expresses this by testing the permission on the RESULTING ROW —
 * `(is_active = false OR has_permission(export))` — so switching to inactive
 * always satisfies the check regardless of what the caller holds. That is
 * intentional: turning something off is the one operation an administrator
 * reaches for when it is going wrong, and it must never be the thing they lack
 * a permission for.
 */
export function canDeactivateSchedule(schedule, viewer) {
  return canEditSchedule(schedule, viewer)
}

/**
 * Everything wrong with this draft, keyed by field, mirroring the constraints in
 * the order the database would hit them. Empty object = savable.
 *
 * `isActive` is validated against the recipient list because
 * `analytics_report_schedules_active_recipients_chk` does: an active schedule
 * with nobody to send to runs for ever, does nothing, and looks healthy the
 * entire time.
 */
export function validateSchedule(draft, { canExport = false } = {}) {
  const errors = {}

  if (!String(draft?.name ?? '').trim()) {
    errors.name = 'Give the schedule a name.'
  }

  const cron = checkCron(draft?.cronExpression, draft?.timezone ?? 'UTC')
  if (!cron.ok) errors.cronExpression = cron.reason

  if (!isValidTimezone(draft?.timezone)) {
    errors.timezone = 'Choose an IANA timezone.'
  }

  if (!SCHEDULE_FORMATS.includes(draft?.format)) {
    errors.format = 'Choose PDF or Excel.'
  }

  const recipients = normaliseRecipients(draft?.recipients)
  if (draft?.isActive && recipients.length === 0) {
    errors.recipients = 'An active schedule needs at least one recipient.'
  }

  if (draft?.isActive && !canExport) {
    errors.isActive =
      'Turning a schedule on requires the Reports & Dashboards export permission — a schedule mails figures out of the system.'
  }

  return errors
}
