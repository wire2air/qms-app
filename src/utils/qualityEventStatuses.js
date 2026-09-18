// Fixed lifecycle enum for quality events (mirrors the DB CHECK constraint +
// QualityEvent.Status on the backend).
//
// ── DISPLAY / FILTER ONLY (2026-08-31) ───────────────────────────────────────
// Nothing in the client writes `statusId` any more. The lifecycle moved fully
// server-side: DRAFT→OPEN is POST /submit, OPEN→CLOSED is POST /close and
// DRAFT|OPEN→CANCELLED is POST /cancel (both e-signed), and a DB trigger refuses
// any status_id change arriving on the GraphQL/syncEngine path with error code
// QMSQE. The model backs that up with `excludeFromGraphQL: ['update']` on
// statusId, so the field cannot even ride along on an inline autosave.
//
// The detail-header status picker that used to write this list was the bypass
// (F-02) and has been replaced by a read-only badge; QualityEventStatusSelectMenu
// is gone with it. All four entries stay because they are still READ in two
// places: QualityEventStatusBadgeById has to render CLOSED and CANCELLED, and
// QualityEventsTable uses the list for its status filter options. Dropping the
// terminal states would blank the badge on exactly the events that most need one.
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
