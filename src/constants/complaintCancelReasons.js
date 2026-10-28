/**
 * Why a complaint was cancelled — the fixed list behind the Cancel Complaint
 * dialog's reason dropdown and the Cancelled banner. Mirrors
 * qms/backend/shared/constants/complaintCancelReasons.js and the CHECK on
 * complaints.cancel_reason_code; change all three together.
 */
export const COMPLAINT_CANCEL_REASONS = Object.freeze([
  { code: 'CREATED_IN_ERROR', label: 'Created in error' },
  { code: 'DUPLICATE', label: 'Duplicate of an existing complaint' },
  { code: 'OUT_OF_SCOPE', label: 'Not a quality complaint / out of scope' },
  { code: 'WITHDRAWN', label: 'Withdrawn by the complainant' },
  { code: 'OTHER', label: 'Other (explain in comments)' },
])

export function complaintCancelReasonLabel(code) {
  return COMPLAINT_CANCEL_REASONS.find((r) => r.code === code)?.label ?? code ?? null
}
