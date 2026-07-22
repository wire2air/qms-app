/**
 * Sections and header actions for an Inspection Lot detail page. Pure — caller
 * resolves the lot + gate flags/handlers. Contextual notices (adverse
 * disposition, calibration, under-review) carry interactive controls, so they
 * stay in the body rather than as config banners.
 */

/** Anchor-nav sections. Results capture + defects + lineage form a single body
 *  section (no nav pill, per the ≤1-section rule).
 */
export function buildInspectionLotSections(_lot) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks.
 *  Status-driven: Check in / out (the active inspector, all types), Edit (while
 *  capturing), Complete (IN_PROGRESS), Submit for QA Disposition (COMPLETED).
 *  There is no separate Start — checking in starts the inspection.
 */
// Lots a QA manager may reopen for re-inspection (mirrors the backend
// REOPENABLE_STATUSES): awaiting disposition or after a failing disposition.
const REOPENABLE_STATUSES = new Set([
  'UNDER_REVIEW',
  'REJECTED',
  'HOLD',
  'REWORK',
  'RETURN_TO_SUPPLIER',
])

// Statuses during which someone actively inspects (so check-in/out applies).
const INSPECTABLE_STATUSES = new Set(['PENDING', 'IN_PROGRESS'])

export function buildInspectionLotActions(gates = {}, handlers = {}) {
  const { canExecute, canDispose, canCreateEvent, statusId, acting, creatingEvent } = gates
  const { isActiveInspector, hasInspector } = gates
  return [
    {
      // Submit for QA disposition — terminal action once the lot is COMPLETED.
      id: 'submit',
      label: 'Submit for QA Disposition',
      variant: 'primary',
      priority: 100,
      visible: !!canDispose && statusId === 'COMPLETED',
      onSelect: handlers.submit,
    },
    {
      // Check in / take over — becomes the active inspector AND starts the
      // inspection (no separate Start). Applies to every inspection type.
      id: 'check-in',
      label: hasInspector ? 'Take over (check in)' : 'Check in',
      variant: 'primary',
      priority: 90,
      visible: !!canExecute && INSPECTABLE_STATUSES.has(statusId) && !isActiveInspector,
      loading: !!acting,
      onSelect: handlers.checkIn,
    },
    {
      // Check out / end shift — release the active-inspector role.
      id: 'check-out',
      label: 'Check out (end shift)',
      variant: 'outline',
      priority: 90,
      visible: !!canExecute && INSPECTABLE_STATUSES.has(statusId) && !!isActiveInspector,
      loading: !!acting,
      onSelect: handlers.checkOut,
    },
    {
      // Complete — finish the inspection; only the checked-in inspector.
      id: 'complete',
      label: 'Complete',
      variant: 'secondary',
      priority: 85,
      visible: !!canExecute && statusId === 'IN_PROGRESS' && !!isActiveInspector,
      loading: !!acting,
      onSelect: handlers.complete,
    },
    {
      // Edit — reference fields while capturing; only the checked-in inspector.
      id: 'edit',
      label: 'Edit',
      variant: 'secondary',
      priority: 80,
      visible:
        !!canExecute &&
        ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(statusId) &&
        !!isActiveInspector,
      onSelect: handlers.edit,
    },
    {
      id: 'reopen',
      label: 'Reopen for Re-inspection',
      variant: 'outline',
      priority: 60,
      visible: !!canDispose && REOPENABLE_STATUSES.has(statusId),
      onSelect: handlers.reopen,
    },
    {
      id: 'create-event',
      label: 'Create Event',
      variant: 'outline',
      priority: 50,
      visible: !!canCreateEvent,
      loading: !!creatingEvent,
      onSelect: handlers.createEvent,
    },
  ]
}
