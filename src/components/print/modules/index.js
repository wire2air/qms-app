/**
 * Print module registry.
 *
 * Each entry maps a module name (case-insensitive) → a loader that returns
 * the print component. The print component is self-contained: it reads its
 * own query params via useRoute, fetches its own data, and wraps content
 * in PrintLayout for the shared chrome.
 *
 * To add a new printable module:
 *   1. Drop a `XPrint.vue` file next to this index.
 *   2. Register it below.
 *   3. On the entity's detail page, link to `/<companyCode>/print?module=X&id=...`
 *
 * Dynamic imports keep each module's data fetching out of the print-bundle
 * boot path — only the requested module loads.
 */
export const printModules = {
  Document: () => import('./DocumentPrint.vue'),
  Capa: () => import('./CapaPrint.vue'),
  // Inspections & Logs:
  //   FieldRecord — one log entry
  //   LogBook     — many entries from one log book, date-range filtered
  FieldRecord: () => import('./FieldRecordPrint.vue'),
  LogBook: () => import('./LogBookPrint.vue'),
  // Audit report — header + conformance score + requirement results + findings.
  AuditInstance: () => import('./AuditInstancePrint.vue'),
  // Training Matrix report — employee × training with roles/status/type, filtered.
  TrainingMatrix: () => import('./TrainingMatrixPrint.vue'),
  // QC inspection report — one inspection lot (meta, sampling, production lots +
  // line clearance, per-characteristic results, disposition).
  InspectionLot: () => import('./InspectionLotPrint.vue'),
  // Retain samples:
  //   RetainSampleLabel    — box label(s) with QR (?size=a4 sheet | 4x2 thermal)
  //   RetainSampleRegister — inventory report, ?state= filtered
  RetainSampleLabel: () => import('./RetainSampleLabelPrint.vue'),
  RetainSampleRegister: () => import('./RetainSampleRegisterPrint.vue'),
  // Quality complaint — header + narrative + product/classification/customer +
  // QA assessment. Mirrors the detail page's post-rail-restructure order.
  Complaint: () => import('./ComplaintPrint.vue'),
  // Validation package — one qualification protocol / framework document, for
  // the customer to execute on paper and sign. Takes ?slug=, not ?id=: the
  // content ships with the app rather than living in the customer's data.
  ValidationProtocol: () => import('./ValidationProtocolPrint.vue'),
  // The quality-event chain. All three share recordPrint.css so a Quality
  // Event, the NC it escalated to and the CAPA that followed print as one
  // document family.
  Nonconformance: () => import('./NonconformancePrint.vue'),
  QualityEvent: () => import('./QualityEventPrint.vue'),
  ChangeRequest: () => import('./ChangeRequestPrint.vue'),
  // Generic register printout — one table for every list page (CAPA, NC,
  // Change Control, Quality Events, Documents, Audits, QC lots, Submissions).
  // Takes ?entity= + ?scope=current|all; see composables/useListPrint.js.
  RecordList: () => import('./RecordListPrint.vue'),
  // Admin-defined module records (Deviation, …) — ONE entry for every
  // promoted form module: the record's template supplies the layout.
  ModuleRecord: () => import('./ModuleRecordPrint.vue'),
}

export function resolveModule(name) {
  if (!name) return null
  // Case-insensitive lookup so the URL is forgiving.
  for (const key of Object.keys(printModules)) {
    if (key.toLowerCase() === String(name).toLowerCase()) {
      return { key, load: printModules[key] }
    }
  }
  return null
}

export function listModules() {
  return Object.keys(printModules)
}
