/**
 * certificateExpiry.js — the arithmetic behind supplier certificate expiry.
 *
 * SUP-F5. The reminder engine has existed since 2026-05:
 *   qms/backend/worker/crontab:42 schedules send_supplier_certificate_expiry_notification,
 *   which selects supplier_assets rows whose
 *     (expires_at::date - CURRENT_DATE) = ANY([90, 30, 0])
 *   and emails the uploader + the company owner.
 *
 * Two properties of that query are load-bearing here and are the reason this
 * module exists instead of hand-picked numbers in a component:
 *
 *  1. **Whole calendar days, not elapsed time.** Postgres casts to ::date on
 *     both sides. A float `diff(now, 'days')` is off by up to a day in either
 *     direction — a cert expiring at 09:00 tomorrow is 0.75 days away at 15:00
 *     today, which floors to 0 ("Expires today") while the worker's calendar
 *     diff is 1. Worse, on the day of expiry itself the float goes negative
 *     after the expiry hour and the UI says "Expired 1d ago" on the very day
 *     the system emails "expires today". So: startOf('day') on both sides.
 *
 *     (Postgres evaluates CURRENT_DATE in the DB session's timezone and we
 *     evaluate in the browser's. Nothing on the frontend can close that gap;
 *     it is at most one day and only at the boundary hours. The float bug was
 *     up to a day *every* hour of the day, so this is strictly better.)
 *
 *  2. **The bands ARE the windows.** `expiryBucket` derives its tiers from
 *     REMINDER_WINDOWS_DAYS rather than restating 30/90 by hand, so a change
 *     to the cron's schedule cannot leave the pill claiming a cert is fine on
 *     a day the system emails a warning about it. `notifiesToday` is the
 *     invariant that pins it: when true, the bucket is never 'ok'.
 *
 * Pure — no Vue, no syncEngine. Tested in certificateExpiry.spec.js.
 */
import { DateTime } from 'luxon'

/**
 * Mirror of REMINDER_WINDOWS_DAYS in
 * qms/backend/worker/tasks/send_supplier_certificate_expiry_notification.js.
 * Keep the two in step: this list is the only thing that makes the UI's idea
 * of "expiring soon" the same idea the reminder emails have.
 */
export const REMINDER_WINDOWS_DAYS = [90, 30, 0]

// Innermost window first. Windows beyond the third reuse the outermost tone
// rather than inventing colours, so adding a window to the cron degrades
// gracefully instead of rendering an undefined class.
const TIERS = ['due', 'warning', 'notice']

/** Coerce a DateTime | ISO string | Date | null into a luxon DateTime (or null). */
export function toDateTime(value) {
  if (!value) return null
  if (DateTime.isDateTime(value)) return value.isValid ? value : null
  if (value instanceof Date) {
    const dt = DateTime.fromJSDate(value)
    return dt.isValid ? dt : null
  }
  const dt = DateTime.fromISO(String(value))
  return dt.isValid ? dt : null
}

/**
 * Whole calendar days from `now` to `expiresAt` — the same integer the worker
 * gets from (expires_at::date - CURRENT_DATE). Negative = already lapsed.
 * Returns null when there is no (or an unparseable) expiry.
 */
export function daysUntilExpiry(expiresAt, now = null) {
  const target = toDateTime(expiresAt)
  if (!target) return null
  const from = (toDateTime(now) ?? DateTime.now()).startOf('day')
  // Round, not floor: a DST transition inside the span makes luxon's day diff
  // 89.958 rather than 90, and flooring that would silently drop a tier.
  return Math.round(target.startOf('day').diff(from, 'days').days)
}

/**
 * Does the cron email about this cert today? True only on the exact window
 * days — the worker uses `= ANY($1)`, not `<=`, so it is silent on days 89
 * and 31, and silent forever once the cert has lapsed.
 */
export function notifiesToday(days, windows = REMINDER_WINDOWS_DAYS) {
  if (days === null || days === undefined) return false
  return windows.includes(days)
}

/**
 * Bucket a day count against the reminder schedule.
 *
 *   'none'    — no expiry recorded (not a tracked certificate)
 *   'expired' — lapsed. The worker deliberately stops emailing past day 0, so
 *               this state has no notification behind it and the UI is the
 *               only place it surfaces. Loudest colour for that reason.
 *   'due'     — inside the innermost window (day 0 by default): emailing today.
 *   'warning' — inside the second window (<= 30 days).
 *   'notice'  — inside the outermost window (<= 90 days).
 *   'ok'      — beyond every window; nothing will be sent for a while.
 */
export function expiryBucket(days, windows = REMINDER_WINDOWS_DAYS) {
  if (days === null || days === undefined) return 'none'
  if (days < 0) return 'expired'
  // Ascending so the first match is the tightest window the cert falls inside.
  const ascending = [...windows].sort((a, b) => a - b)
  const tierIndex = ascending.findIndex((w) => days <= w)
  if (tierIndex === -1) return 'ok'
  return TIERS[Math.min(tierIndex, TIERS.length - 1)]
}

/** Compact pill copy. Kept short — this renders inline in a list row. */
export function expiryLabel(days) {
  if (days === null || days === undefined) return 'No expiry'
  if (days < 0) return `Expired ${-days}d ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days}d`
}

/** Everything a pill needs, in one pass. */
export function describeExpiry(expiresAt, { now = null, windows = REMINDER_WINDOWS_DAYS } = {}) {
  const days = daysUntilExpiry(expiresAt, now)
  return {
    days,
    bucket: expiryBucket(days, windows),
    label: expiryLabel(days),
    notifiesToday: notifiesToday(days, windows),
  }
}

/**
 * Normalise a picked expiry date into the ISO string the upload endpoint
 * wants (`z.string().datetime({ offset: true })`).
 *
 * BaseDateField mode="date" hands back a local-midnight DateTime. Sending
 * that verbatim moves the cert across a calendar day for every viewer east of
 * UTC: 2026-12-31T00:00+05:30 is 2026-12-30 in UTC, and `expires_at::date` in
 * the worker's query would then fire the reminders a day early. Pinning the
 * picked y/m/d to 12:00 UTC keeps the date the user chose intact under the
 * ::date cast and under redisplay in any ordinary timezone.
 *
 * Returns null for an empty/unparseable value so the caller can simply omit
 * the field.
 */
export function toExpiryIso(value) {
  const dt = toDateTime(value)
  if (!dt) return null
  return DateTime.utc(dt.year, dt.month, dt.day, 12, 0, 0).toISO({ suppressMilliseconds: false })
}
