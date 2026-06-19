// Fixed lifecycle enum for quality events (mirrors the DB CHECK constraint +
// QualityEvent.Status on the backend). Used by the status badge + select menu.
export const QUALITY_EVENT_STATUSES = [
  { id: 'DRAFT', name: 'Draft' },
  { id: 'OPEN', name: 'Open' },
  { id: 'UNDER_REVIEW', name: 'Under Review' },
  { id: 'AWAITING_DECISION', name: 'Awaiting Decision' },
  { id: 'ESCALATED', name: 'Escalated' },
  { id: 'CLOSED', name: 'Closed' },
  { id: 'CANCELLED', name: 'Cancelled' },
]

export const QUALITY_EVENT_STATUS_MAP = Object.fromEntries(
  QUALITY_EVENT_STATUSES.map((s) => [s.id, s]),
)
