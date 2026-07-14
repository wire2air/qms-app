/**
 * Per-module workflow descriptors.
 *
 * The Nonconformance, CAPA, and Change Request modules all share the same
 * workflow-step UI shape: a step card with header / assignees / inline
 * action buttons / a generic actions menu / an optional per-step form.
 * Before this refactor each module had its own copy of every component
 * (~4,100 lines across 10 files). The components are now generic — they
 * take a descriptor from this file as their `module` prop, and the
 * descriptor parameterises the few things that actually differ between
 * modules.
 *
 * Add a new module here when growing the engine to cover Document /
 * LogBook step UI (today they have their own renderers). Keep the
 * descriptor a plain object literal — no instance methods, no inheritance.
 * If a behaviour can't be expressed as data, add a function-valued field
 * (e.g. `getContextFields(resource)`) rather than reaching for OOP.
 *
 * Search the descriptor for `if (module === ...)` smells in the generic
 * components — those are the canary for the descriptor leaking back into
 * per-module branching. Lift such cases into a new descriptor field.
 */

/**
 * @typedef {Object} WorkflowModule
 * @property {string} key                         — short identifier ('NC' / 'CAPA' / 'CR')
 * @property {string} displayName                 — user-facing label ('NC' / 'CAPA' /
 *   'Change Request'). Used in submit-picker empty-state hints
 *   ('... before submitting this <displayName>').
 * @property {string} resourceType                — workflow_instances.resource_type value
 * @property {string} apiPath                     — module path under /v1/services/<apiPath>/:id/...
 * @property {string} resourceIdParam             — name of the resource-id prop passed by parents
 * @property {string} recordModelName             — SyncEngine model name for per-step records
 * @property {string} recordResourceFk            — column name on the *Record row that points
 *   back at the parent resource (e.g. 'capaId' on CapaRecord,
 *   'changeRequestId' on CrRecord). Used both as the filter field in
 *   the records list query and as the FK column when creating a new
 *   record.
 * @property {Object} resourceModel               — SyncEngine model name + display fields
 * @property {string} resourceModel.modelName     — e.g. 'Nonconformance'
 * @property {string} workflowVersionModuleId     — value passed to <WorkflowVersionSelect moduleId>
 *   to filter the dropdown to workflows authored for this module.
 * @property {(resource:Object) => Object} getStepFormContextFields
 *   — non-persisted fields the form needs (e.g. _parent_problem from the
 *   resource's description). Stripped before save.
 */

/** @type {WorkflowModule} */
export const NC_MODULE = {
  key: 'NC',
  displayName: 'NC',
  resourceType: 'Nonconformance',
  apiPath: 'nonconformances',
  resourceIdParam: 'ncId',
  recordModelName: 'NcRecord',
  recordResourceFk: 'ncId',
  resourceModel: { modelName: 'Nonconformance' },
  workflowVersionModuleId: 'NON_CONFORMANCE',
  getStepFormContextFields(resource) {
    return { _parent_problem: resource?.description ?? '' }
  },
}

/** @type {WorkflowModule} */
export const CAPA_MODULE = {
  key: 'CAPA',
  displayName: 'CAPA',
  resourceType: 'Capa',
  apiPath: 'capas',
  resourceIdParam: 'capaId',
  recordModelName: 'CapaRecord',
  recordResourceFk: 'capaId',
  resourceModel: { modelName: 'Capa' },
  workflowVersionModuleId: 'CAPA',
  getStepFormContextFields(resource) {
    // CAPA inherits the source NC's problem statement when present; the
    // resource itself just carries `description`. The form schema can
    // reference either via _parent_problem.
    return { _parent_problem: resource?.description ?? '' }
  },
}

/** @type {WorkflowModule} */
export const CR_MODULE = {
  key: 'CR',
  displayName: 'Change Request',
  resourceType: 'ChangeRequest',
  apiPath: 'changeRequests',
  resourceIdParam: 'crId',
  recordModelName: 'CrRecord',
  recordResourceFk: 'changeRequestId',
  resourceModel: { modelName: 'ChangeRequest' },
  workflowVersionModuleId: 'CHANGE_REQUEST',
  getStepFormContextFields(resource) {
    return { _parent_problem: resource?.reasonForChange ?? resource?.description ?? '' }
  },
}

// Standalone QMS Complaint (separate `complaints` table + /complaints API).
export const COMPLAINT_MODULE = {
  key: 'CMP',
  displayName: 'Complaint',
  resourceType: 'Complaint',
  apiPath: 'complaints',
  resourceIdParam: 'complaintId',
  recordModelName: 'ComplaintRecord',
  recordResourceFk: 'complaintId',
  resourceModel: { modelName: 'Complaint' },
  workflowVersionModuleId: 'COMPLAINT',
  getStepFormContextFields(resource) {
    return { _parent_problem: resource?.description ?? '' }
  },
}

// LogBookVersion runs through the same generic workflow engine but
// doesn't have everything a full controlled-resource module needs
// (no per-step record model — log-book entries are FieldRecords on a
// separate surface from the version-approval flow). It's listed here
// so its submit-time picker can use the unified WorkflowStepReviewerSelect;
// fields unrelated to the picker stay undefined.
/** @type {WorkflowModule} */
export const LOG_BOOK_VERSION_MODULE = {
  key: 'LOG_BOOK_VERSION',
  displayName: 'log book',
  resourceType: 'LogBookVersion',
  apiPath: 'logBooks',
  workflowVersionModuleId: 'LOG_BOOK',
}

// AuditInstance — close-out workflow rides the generic engine
// (resourceType 'AuditInstance', moduleId 'AUDIT'). Per-step form
// responses go onto the AuditRecord SyncEngine model, exact parity
// with capa_records / nc_records / cr_records.
/** @type {WorkflowModule} */
export const AUDIT_INSTANCE_MODULE = {
  key: 'AUDIT_INSTANCE',
  displayName: 'audit',
  resourceType: 'AuditInstance',
  apiPath: 'auditInstances',
  resourceIdParam: 'auditId',
  recordModelName: 'AuditRecord',
  recordResourceFk: 'auditInstanceId',
  resourceModel: { modelName: 'AuditInstance' },
  workflowVersionModuleId: 'AUDIT_INSTANCE',
  getStepFormContextFields(resource) {
    return {
      _audit_scope: resource?.scope ?? '',
      _audit_objectives: resource?.objectives ?? '',
    }
  },
}

// AuditStandardVersion runs through the same generic workflow engine
// for clause-list approval — DocumentVersion / LogBookVersion parity.
// No per-step record model (the approval workflow is comment-only
// e-sign on both steps); listed here so its submit-time picker can use
// the unified WorkflowStepReviewerSelect.
/** @type {WorkflowModule} */
export const AUDIT_STANDARD_VERSION_MODULE = {
  key: 'AUDIT_STANDARD_VERSION',
  displayName: 'audit standard',
  resourceType: 'AuditStandardVersion',
  apiPath: 'auditStandards',
  workflowVersionModuleId: 'AUDIT_STANDARD',
}

export const MODULES = {
  NC: NC_MODULE,
  CAPA: CAPA_MODULE,
  CR: CR_MODULE,
  LOG_BOOK_VERSION: LOG_BOOK_VERSION_MODULE,
  AUDIT: AUDIT_INSTANCE_MODULE,
  AUDIT_STANDARD_VERSION: AUDIT_STANDARD_VERSION_MODULE,
}

/**
 * Admin-defined modules (generic module factory) ride the same engine. They
 * share ONE descriptor shape; the `resourceType` is the module's form-template
 * `internalName` (dynamic), so build a descriptor per record. Per-section answers
 * go onto the ModuleSectionRecord model — records.payload is assembled on
 * completion by the backend handler. apiPath 'form-modules' must back the
 * step-action endpoints (reject/reassign/send-back/complete).
 *
 * @param {string} moduleKey   — the record's moduleKey (= template.internalName)
 * @param {string} [displayName]
 * @returns {WorkflowModule}
 */
export function formModuleFor(moduleKey, displayName) {
  return {
    key: 'FORM',
    displayName: displayName || 'Module',
    resourceType: moduleKey,
    apiPath: 'form-modules',
    resourceIdParam: 'recordId',
    recordModelName: 'ModuleSectionRecord',
    recordResourceFk: 'recordId',
    resourceModel: { modelName: 'Record' },
    workflowVersionModuleId: 'FORM',
    getStepFormContextFields: () => ({}),
  }
}
