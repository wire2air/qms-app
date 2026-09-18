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
// isReopenable): awaiting disposition, quarantined, or CLOSED with an
// adverse disposition (the caller resolves `dispositionAdverse`).
const REOPENABLE_PHASES = new Set(['UNDER_REVIEW', 'HOLD'])

// Phases during which someone actively inspects (so check-in/out applies).
// The parent status is OPEN throughout execution — unified 2026-08-28.
const INSPECTABLE_PHASES = new Set(['PENDING', 'IN_PROGRESS'])

export function buildInspectionLotActions(gates = {}, handlers = {}) {
  const { canExecute, canDispose, canCreateEvent, canRetain, statusId, acting, creatingEvent } = gates
  const { isActiveInspector, hasInspector, inspectionPhase, dispositionAdverse } = gates
  const isOpen = statusId === 'OPEN'
  const openPhase = (p) => isOpen && inspectionPhase === p
  const inspectable = isOpen && INSPECTABLE_PHASES.has(inspectionPhase)
  const reopenable =
    (isOpen && REOPENABLE_PHASES.has(inspectionPhase)) ||
    (statusId === 'CLOSED' && !!dispositionAdverse)
  return [
    {
      // Submit for QA disposition — terminal action once the lot is COMPLETED.
      id: 'submit',
      label: 'Submit for QA Disposition',
      variant: 'primary',
      priority: 100,
      visible: !!canDispose && openPhase('COMPLETED'),
      onSelect: handlers.submit,
    },
    {
      // Check in / take over — becomes the active inspector AND starts the
      // inspection (no separate Start). Applies to every inspection type.
      id: 'check-in',
      label: hasInspector ? 'Take over (check in)' : 'Check in',
      variant: 'primary',
      priority: 90,
      visible: !!canExecute && inspectable && !isActiveInspector,
      loading: !!acting,
      onSelect: handlers.checkIn,
    },
    {
      // Check out / end shift — release the active-inspector role.
      id: 'check-out',
      label: 'Check out (end shift)',
      variant: 'outline',
      priority: 90,
      visible: !!canExecute && inspectable && !!isActiveInspector,
      loading: !!acting,
      onSelect: handlers.checkOut,
    },
    {
      // Complete — finish the inspection; only the checked-in inspector.
      id: 'complete',
      label: 'Complete',
      variant: 'secondary',
      priority: 85,
      visible: !!canExecute && openPhase('IN_PROGRESS') && !!isActiveInspector,
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
        (statusId === 'DRAFT' || inspectable) &&
        !!isActiveInspector,
      onSelect: handlers.edit,
    },
    {
      id: 'reopen',
      label: 'Reopen for Re-inspection',
      variant: 'outline',
      priority: 60,
      visible: !!canDispose && reopenable,
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
    {
      // Retain a physical sample from this lot (also offered on the rail card).
      id: 'retain-sample',
      label: 'Retain Sample',
      variant: 'outline',
      priority: 48,
      visible: !!canRetain,
      onSelect: handlers.retainSample,
    },
    {
      id: 'print',
      label: 'Print report',
      variant: 'outline',
      priority: 45,
      visible: true,
      onSelect: handlers.print,
    },
  ]
}
