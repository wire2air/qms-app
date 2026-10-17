/**
 * Why a Quality Event was cancelled — the fixed list behind the Cancel Event
 * dialog's reason dropdown and the Cancelled banner. Mirrors
 * qms/backend/shared/constants/qualityEventCancelReasons.js and the CHECK on
 * quality_events.cancel_reason_code; change all three together.
 */
export const QUALITY_EVENT_CANCEL_REASONS = Object.freeze([
  { code: 'CREATED_IN_ERROR', label: 'Created in error' },
  { code: 'DUPLICATE', label: 'Duplicate of an existing record' },
  { code: 'OUT_OF_SCOPE', label: 'Not a quality event / out of scope' },
  { code: 'WITHDRAWN', label: 'Withdrawn before investigation or escalation' },
  { code: 'OTHER', label: 'Other (explain in comments)' },
])

export function qualityEventCancelReasonLabel(code) {
  return QUALITY_EVENT_CANCEL_REASONS.find((r) => r.code === code)?.label ?? code ?? null
}
