/**
 * Effective-date rules for creating a document.
 *
 * The date belongs to the MANUAL release path only. With "Automatically make
 * effective" on, the date is whenever the final approval lands, so offering a
 * field there invites a value the system will ignore (user request
 * 2026-08-15).
 */
import { DateTime } from 'luxon'

/** True when the author must supply an effective date. */
export function effectiveDateRequired(autoEffectiveOnApproval) {
  return !autoEffectiveOnApproval
}

/**
 * Future-dated only, and only at CREATION — scheduling a release for yesterday
 * is a typo, not an intent.
 *
 * Deliberately not enforced afterwards: setEffective takes
 * `version.effectiveDate || now`, so a date that has since passed simply makes
 * the document effective. That is the behaviour you want for a document
 * approved later than planned, and adding a guard there would strand it.
 *
 * Returns true when valid, else the message — the BaseField rule contract.
 */
export function futureDateRule(message = 'Pick a future date') {
  return (value) => {
    if (!value) return true // `required` owns emptiness
    const dt = DateTime.isDateTime(value) ? value : DateTime.fromJSDate(new Date(value))
    if (!dt.isValid) return 'Enter a valid date'
    return dt.endOf('day') > DateTime.now() || message
  }
}
