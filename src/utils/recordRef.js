/**
 * Canonical registry for cross-module record lineage (record_links). Maps an
 * entity type string (shared with the backend recordLinkService) to how it's
 * displayed and linked: which SyncEngine model holds it, the field that carries
 * its human number, a short label, and its detail route (null = no standalone
 * page, rendered as a non-clickable chip).
 *
 * Keep the type strings in sync with backend recordLinkService / linkSpawned.
 */
export const RECORD_REF = {
  InspectionLot: { model: 'InspectionLot', numberField: 'lotNumber', label: 'Lot', path: (id) => `/qc-inspection/lots/${id}` },
  Nonconformance: { model: 'Nonconformance', numberField: 'ncNumber', label: 'NC', path: (id) => `/nonconformances/${id}` },
  Capa: { model: 'Capa', numberField: 'capaNumber', label: 'CAPA', path: (id) => `/capas/${id}` },
  ChangeRequest: { model: 'ChangeRequest', numberField: 'crNumber', label: 'CR', path: (id) => `/change-requests/${id}` },
  CustomerComplaint: { model: 'CustomerComplaint', numberField: 'complaintNumber', label: 'Complaint', path: (id) => `/customer-complaints/${id}` },
  // Findings live inside an audit — no standalone detail route.
  AuditFinding: { model: 'AuditFinding', numberField: 'findingNumber', label: 'Finding', path: null },
  TrainingInstance: { model: 'TrainingInstance', numberField: 'title', label: 'Training', path: (id) => `/training-instances/${id}` },
}

export function recordRefConfig(type) {
  return RECORD_REF[type] || null
}
