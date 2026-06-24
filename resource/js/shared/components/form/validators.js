/**
 * validators.js — the form rule library.
 *
 * A rule is `(value) => true | string | ((label) => string)`:
 *   • `true`            → valid
 *   • a string          → an explicit error message
 *   • a `(label)=>string` → a label-derived default; BaseField resolves it via
 *                          resolveRuleMessage() so `required()` on a field
 *                          labeled "Title" reads "Title is required."
 *
 * Rules are authored on each <BaseField :rules="[…]">. BaseForm collects them on
 * submit (see 2026-06-24-form-field-rules-engine-design.md). Cross-field checks
 * need no extra machinery — a rule's closure captures the reactive `form`.
 *
 *   :rules="[required()]"
 *   :rules="[required('Give it a title')]"
 *   :rules="[requiredWhen(() => form.isSupplierFacing, 'Pick a supplier.')]"
 *   :rules="[v => v > 0 || 'Must be positive']"   // raw inline rule
 *
 * Shipped: required, requiredWhen, email. Deferred until a form needs them
 * (one-liners to add): minLen, maxLen, min, max, pattern.
 */

// Empty for the purpose of `required`: blank/whitespace string, null/undefined,
// empty array, NaN, and an unchecked checkbox (false). Note 0 is NOT empty.
function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'number') return Number.isNaN(value)
  if (value === false) return true
  return false
}

/** Fails when the value is empty. `msg` overrides the label-derived default. */
export function required(msg) {
  return (value) => {
    if (!isEmpty(value)) return true
    return msg || ((label) => (label ? `${label} is required.` : 'This field is required.'))
  }
}

/**
 * Required only while `condFn()` is truthy — for conditional / cross-field
 * rules. `condFn` closes over the reactive form, so it re-evaluates each run.
 */
export function requiredWhen(condFn, msg) {
  return (value) => {
    if (!condFn()) return true
    return required(msg)(value)
  }
}

// Pragmatic single-@ shape: a local part, an @, then a dotted domain — no
// internal whitespace. Deliberately not RFC-5322-exhaustive; it rejects the
// mistakes users actually make (missing @, missing TLD, stray spaces).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Fails when a non-empty value isn't a valid email address. Passes on empty so
 * `required()` owns emptiness — compose them: `:rules="[required(), email()]"`.
 * `msg` overrides the label-derived default.
 */
export function email(msg) {
  return (value) => {
    if (isEmpty(value) || EMAIL_RE.test(String(value).trim())) return true
    return (
      msg ||
      ((label) =>
        label ? `${label} must be a valid email address.` : 'Enter a valid email address.')
    )
  }
}

/**
 * Resolve a rule's failure result to a final message string. A function result
 * is a label-derived default; a string is used verbatim.
 */
export function resolveRuleMessage(result, label) {
  return typeof result === 'function' ? result(label) : result
}
