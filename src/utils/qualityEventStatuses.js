// Fixed lifecycle enum for quality events (mirrors the DB CHECK constraint +
// QualityEvent.Status on the backend). Used by the status badge + select menu.
//
// ESCALATED was removed 2026-08-18. Escalating spawns a downstream NC / CAPA /
// Change Request but does not resolve the event — it stays open and still has
// to be reviewed and closed. As a status it claimed otherwise while Close was
// still offered and still required, so the badge contradicted the buttons.
// Escalation now lives where it belongs: a record_links row, surfaced as a chip
// on the event and a row on its printout.
export const QUALITY_EVENT_STATUSES = [
  { id: 'DRAFT', name: 'Draft' },
  { id: 'OPEN', name: 'Open' },
  { id: 'CLOSED', name: 'Closed' },
  { id: 'CANCELLED', name: 'Cancelled' },
]

export const QUALITY_EVENT_STATUS_MAP = Object.fromEntries(
  QUALITY_EVENT_STATUSES.map((s) => [s.id, s]),
)
