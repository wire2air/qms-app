/**
 * Canonical registry for cross-module record lineage (record_links). Maps an
 * entity type string (shared with the backend recordLinkService) to how it's
 * displayed and linked: which SyncEngine model holds it, the field that carries
 * its human number, a short label, and its detail route (null = no standalone
 * page, rendered as a non-clickable chip).
 *
 * Keep the type strings in sync with backend recordLinkService / linkSpawned.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

export const RECORD_REF = {
  InspectionLot: { model: 'InspectionLot', numberField: 'lotNumber', label: 'Lot', path: (id) => `/qc-inspection/lots/${id}` },
  QualityEvent: { model: 'QualityEvent', numberField: 'eventNumber', label: 'Event', path: (id) => `/qualityEvents/${id}` },
  Nonconformance: { model: 'Nonconformance', numberField: 'ncNumber', label: 'NC', path: (id) => `/nonconformances/${id}` },
  Capa: { model: 'Capa', numberField: 'capaNumber', label: 'CAPA', path: (id) => `/capas/${id}` },
  ChangeRequest: { model: 'ChangeRequest', numberField: 'crNumber', label: 'CR', path: (id) => `/change-requests/${id}` },
  CustomerComplaint: { model: 'CustomerComplaint', numberField: 'complaintNumber', label: 'Complaint', path: (id) => `/customer-complaints/${id}` },
  Complaint: { model: 'Complaint', numberField: 'complaintNumber', label: 'Complaint', path: (id) => `/complaints/${id}` },
  // Findings live inside an audit — no standalone detail route.
  AuditFinding: { model: 'AuditFinding', numberField: 'findingNumber', label: 'Finding', path: null },
  TrainingInstance: { model: 'TrainingInstance', numberField: 'title', label: 'Training', path: (id) => `/training-instances/${id}` },
  // Audit Records Packages anchor share links on the audit; the auditor page
  // redirects EXTERNAL audits to /auditee/:id.
  AuditInstance: { model: 'AuditInstance', numberField: 'auditNumber', label: 'Audit', path: (id) => `/audits/instances/${id}` },
  Document: { model: 'Document', numberField: 'docNumber', label: 'Doc', path: (id) => `/documents/${id}` },
}

export function recordRefConfig(type) {
  return RECORD_REF[type] || null
}

// Inverse: record-number field → entityType, so a tool-result row can be
// classified by whichever *Number field it carries (eventNumber → QualityEvent,
// ncNumber → Nonconformance, …). Built from RECORD_REF so it stays in sync; only
// genuine number fields (TrainingInstance's `title` is excluded). Document isn't
// in the lineage registry but the AI tools return docNumber, so map it too.
const NUMBER_FIELD_TO_TYPE = Object.fromEntries(
  Object.entries(RECORD_REF)
    .filter(([, c]) => c.numberField?.endsWith('Number'))
    .map(([type, c]) => [c.numberField, type]),
)
NUMBER_FIELD_TO_TYPE.docNumber = 'Document'

// Document has a detail page but isn't in RECORD_REF (a record_links registry).
const PATH_FOR = (type, id) =>
  type === 'Document' ? `/documents/${id}` : RECORD_REF[type]?.path?.(id) ?? null

/**
 * Build a lookup of record number → navigable target from the AI chat's
 * tool-call result rows, so assistant markdown can linkify record identifiers.
 *
 * Handles both row shapes: the per-module `*_list` tools (named number field,
 * e.g. `eventNumber`) and `record_search` (`entityType` + `code`). Skips types
 * with no standalone detail page (e.g. AuditFinding).
 *
 * @param {Array} items  chat stream items ({ kind, result?: { rows } })
 * @returns {Map<string, { entityType: string, id: string, to: string }>}
 */
export function buildRecordIndex(items) {
  const index = new Map()
  for (const item of items ?? []) {
    if (item?.kind !== 'tool_call') continue
    const rows = item.result?.rows
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row?.id) continue
      let entityType = row.entityType || null
      let number = null
      if (entityType) {
        const field = RECORD_REF[entityType]?.numberField
        number = row.code ?? (field ? row[field] : null)
      } else {
        for (const [field, type] of Object.entries(NUMBER_FIELD_TO_TYPE)) {
          if (row[field]) {
            entityType = type
            number = row[field]
            break
          }
        }
      }
      if (!entityType || !number) continue
      const path = PATH_FOR(entityType, row.id)
      if (!path) continue
      const num = String(number)
      if (!index.has(num)) index.set(num, { entityType, id: row.id, to: getCompanyPath(path) })
    }
  }
  return index
}
