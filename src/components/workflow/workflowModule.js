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
 * @property {(resource:Object) => Object} getStepFormContextFields
 *   — non-persisted fields the form needs (e.g. _parent_problem from the
 *   resource's description). Stripped before save.
 */

/** @type {WorkflowModule} */
export const NC_MODULE = {
  key: 'NC',
  resourceType: 'Nonconformance',
  apiPath: 'nonconformances',
  resourceIdParam: 'ncId',
  recordModelName: 'NcRecord',
  recordResourceFk: 'ncId',
  resourceModel: { modelName: 'Nonconformance' },
  getStepFormContextFields(resource) {
    return { _parent_problem: resource?.description ?? '' }
  },
}

/** @type {WorkflowModule} */
export const CAPA_MODULE = {
  key: 'CAPA',
  resourceType: 'Capa',
  apiPath: 'capas',
  resourceIdParam: 'capaId',
  recordModelName: 'CapaRecord',
  recordResourceFk: 'capaId',
  resourceModel: { modelName: 'Capa' },
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
  resourceType: 'ChangeRequest',
  apiPath: 'changeRequests',
  resourceIdParam: 'crId',
  recordModelName: 'CrRecord',
  recordResourceFk: 'changeRequestId',
  resourceModel: { modelName: 'ChangeRequest' },
  getStepFormContextFields(resource) {
    return { _parent_problem: resource?.reasonForChange ?? resource?.description ?? '' }
  },
}

export const MODULES = {
  NC: NC_MODULE,
  CAPA: CAPA_MODULE,
  CR: CR_MODULE,
}
