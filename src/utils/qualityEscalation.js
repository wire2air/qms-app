/**
 * Field mappings for the Quality Event → NC → CAPA escalation chain.
 *
 * The three modules are one quality event at escalating severity, so context
 * travels down the chain rather than being re-entered at each hop. Most fields
 * copy across unchanged (title, description, site, department, supplier, and
 * the shared Category). Severity is the exception: CAPA has no severity field,
 * it has a priority — which is what actually drives scheduling — so "how bad"
 * has to become "how urgent" at the NC → CAPA boundary.
 *
 * The backend owns the same mapping in services/ncCapaCreateService.js
 * (capaPriorityFromNcSeverity) for the server-side paths — the supplier
 * NC + 8D shortcut and Quality Event escalation. This copy drives the
 * create-form seeding. Keep the two in step.
 */

/** NC severity id → CAPA priority id. */
const NC_SEVERITY_TO_CAPA_PRIORITY = {
  CRITICAL: 'CRITICAL',
  MAJOR: 'HIGH',
  MINOR: 'LOW',
}

/**
 * Map an NC severity onto a CAPA priority.
 *
 * Anything unrecognised falls to MEDIUM: with no signal, the neutral middle is
 * the honest answer — guessing CRITICAL cries wolf, guessing LOW buries it.
 *
 * @param {string|null|undefined} severityId
 * @returns {string} a CAPA priority id
 */
export function capaPriorityFromNcSeverity(severityId) {
  return NC_SEVERITY_TO_CAPA_PRIORITY[severityId] || 'MEDIUM'
}
