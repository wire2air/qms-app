/**
 * Record kinds that can be shared with someone outside the company.
 *
 * Mirrors `@qability/shared/constants/shareableEntities.js`, which is canonical
 * — the API asserts its projection registry matches that list, so a type is
 * shareable only if a curated external projection exists for it. This copy
 * exists because the frontend is not a workspace member and cannot import from
 * the backend package; it is display labels only, never a permission check.
 */
export const SHAREABLE_ENTITIES = {
  Nonconformance: 'Nonconformance',
  Capa: 'CAPA',
  ChangeRequest: 'Change Request',
  Complaint: 'Complaint',
  InspectionLot: 'QC Inspection',
  QualityEvent: 'Quality Event',
  Document: 'Document',
  AuditInstance: 'Audit Records Package',
}

export const SHAREABLE_ENTITY_TYPES = Object.keys(SHAREABLE_ENTITIES)

export function shareableLabel(entityType) {
  return SHAREABLE_ENTITIES[entityType] ?? entityType
}
