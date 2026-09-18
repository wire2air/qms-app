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
 * @property {string} [authzModule]               — authz module id ('ncr', 'capa', …) used to
 *                                                  ask whether a NON-assignee may act on this
 *                                                  module's steps. Present only for the record
 *                                                  types the backend can scope-check (see
 *                                                  utils/workflowStepAccess.js); absent means
 *                                                  assignee-only, which is what the server
 *                                                  enforces for those types too.
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
  authzModule: 'ncr',
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
  authzModule: 'capa',
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
  authzModule: 'change_control',
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
  authzModule: 'complaints',
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
export const LOG_BOOK_APPROVAL_MODULE = {
  key: 'LOG_BOOK_APPROVAL',
  displayName: 'log book',
  resourceType: 'LogBook',
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
  LOG_BOOK_APPROVAL: LOG_BOOK_APPROVAL_MODULE,
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
    // Promotion registers the moduleKey as an authz module with per-role
    // grants, so the matrix applies to these steps like any record module —
    // without this, steps were assignee-only and a reopened effectiveness
    // check was dead for everyone else, the owner included (2026-08-26).
    authzModule: moduleKey,
    // records.owner_user_id, not the built-ins' ownerId — scopeAllows needs
    // to know where the custodian lives for the own-scope tier.
    scopeOwnerField: 'ownerUserId',
    getStepFormContextFields: () => ({}),
  }
}

// ─── What kind of workflow does a module run? ────────────────────────────────
//
// Two shapes exist, and until now nothing declared which was which — so the
// builder offered Task / Approval / Schedule Task everywhere and you could add
// a Task step to a Log Book approval, where it captures nothing and confuses
// the author (user report 2026-08-15).
//
//   RECORD workflows   (NC, CAPA, Change Control, Complaint, generic modules)
//     carry the work itself: task forms, approvals, scheduled follow-ups.
//
//   APPROVAL flows     (Document Control, Log Book, Inspections & Logs, Audit
//     Standard, Audit Instance, QC Inspection) gate a version/record
//     transition. Reviewers approve or reject — there is nothing to fill in.
//
// The RECORD side is the closed list, and everything else is an approval flow.
// That direction is deliberate: the `modules` table is shared reference data
// that grows whenever a module ships, and the first version of this map listed
// the approval side instead — so INSPECTIONS_LOGS, which nobody remembered to
// add, showed up under Templates offering Task steps (user report
// 2026-08-15, the second time this bit). Defaulting an unrecognised module to
// approval-only fails visibly (a missing step type someone reports) rather
// than silently (a Task step that captures nothing).
//
// Promoted/admin-defined modules from the generic module factory are safe
// under this rule: they all run as moduleId 'FORM' (see moduleRecordService.js
// — the module's own key lives on resourceType, not on the workflow), so no
// per-tenant id ever reaches this function.
const RECORD_MODULE_IDS = new Set([
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'COMPLAINT', // standalone QMS complaint
  'CUSTOMER_COMPLAINT',
  'FORM', // every admin-defined / promoted module
])

/** Step types a module's workflows may contain, in wizard order. */
export function allowedStepTypes(moduleId) {
  return RECORD_MODULE_IDS.has(moduleId) ? ['ACTION', 'APPROVAL', 'DELAY'] : ['APPROVAL']
}

/** True when the module gates transitions only — no task forms anywhere. */
export function isApprovalOnlyModule(moduleId) {
  return !RECORD_MODULE_IDS.has(moduleId)
}

// Modules whose workflows belong to ANOTHER entity and are generated from it,
// never authored standalone. Document Control (module 'APPROVAL') is the only
// one: its flow now lives inside the Document Template, which generates a
// companion workflow from the reviewer/approver roles you pick there (user
// decision 2026-08-15 — "so user doesn't have to create an approval flow for
// documents separately"). Those generated rows are real workflows the engine
// runs, but showing them in Approval Flows would invite editing a flow the
// template will regenerate on its next save.
const TEMPLATE_OWNED_MODULE_IDS = new Set(['APPROVAL'])

/**
 * True when a module's workflows are owned and generated by another entity, so
 * they must not appear in — or be creatable from — the Approval Flows list.
 */
export function isTemplateOwnedModule(moduleId) {
  return TEMPLATE_OWNED_MODULE_IDS.has(moduleId)
}

// Modules whose workflows the SYSTEM mints, so hand-authoring one is
// meaningless — the row would never be reached by anything.
//
//   APPROVAL — generated from a Document Template's reviewer/approver roles.
//   FORM     — "Form Modules": every admin-defined module promoted from a form
//              template runs under this single id, and moduleRecordService
//              creates its workflow. Picking it in the create wizard produces
//              a workflow no module will ever use (user report 2026-08-15).
//
// Distinct from isTemplateOwnedModule, which also governs LIST visibility:
// an existing FORM workflow is still a real record workflow worth seeing and
// editing under Templates. It just isn't something you create from scratch.
const SYSTEM_AUTHORED_MODULE_IDS = new Set(['APPROVAL', 'FORM'])

/** True when the module's workflows are minted by the system, not authored. */
export function isSystemAuthoredModule(moduleId) {
  return SYSTEM_AUTHORED_MODULE_IDS.has(moduleId)
}

// Modules whose SURFACE is parked (user 2026-08-29): Customer Complaint is
// the support-desk customer_complaints table, superseded for QMS work by the
// standalone Complaint module. Its reference row (and any existing workflows)
// stay real — but create pickers must not invite authoring a workflow no
// live surface will ever run.
const DORMANT_MODULE_IDS = new Set(['CUSTOMER_COMPLAINT'])

/** True when the module's surface is dormant — hide it from create pickers. */
export function isDormantModule(moduleId) {
  return DORMANT_MODULE_IDS.has(moduleId)
}
