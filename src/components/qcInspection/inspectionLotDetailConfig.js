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
 *  Status-driven: Edit (while capturing), Start (PENDING), Complete (IN_PROGRESS),
 *  Submit for QA Disposition (COMPLETED).
 */
export function buildInspectionLotActions(gates = {}, handlers = {}) {
  const { canExecute, canDispose, canCreateEvent, statusId, acting, creatingEvent } = gates
  return [
    {
      id: 'create-event',
      label: 'Create Event',
      variant: 'outline',
      priority: 95,
      visible: !!canCreateEvent,
      loading: !!creatingEvent,
      onSelect: handlers.createEvent,
    },
    {
      id: 'submit',
      label: 'Submit for QA Disposition',
      variant: 'primary',
      priority: 100,
      visible: !!canDispose && statusId === 'COMPLETED',
      onSelect: handlers.submit,
    },
    {
      id: 'start',
      label: 'Start',
      variant: 'secondary',
      priority: 70,
      visible: !!canExecute && statusId === 'PENDING',
      loading: !!acting,
      onSelect: handlers.start,
    },
    {
      id: 'complete',
      label: 'Complete',
      variant: 'secondary',
      priority: 70,
      visible: !!canExecute && statusId === 'IN_PROGRESS',
      loading: !!acting,
      onSelect: handlers.complete,
    },
    {
      id: 'edit',
      label: 'Edit',
      variant: 'secondary',
      priority: 40,
      visible: !!canExecute && ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(statusId),
      onSelect: handlers.edit,
    },
  ]
}
