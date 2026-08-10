/**
 * Frontend audit log constants — mirrors backend/shared/constants/auditActions.js.
 *
 * The backend file is the source of truth: it is what actually gets written to
 * `audit_logs.action`. Anything missing from these three maps renders as the
 * same anonymous grey "something happened" pill, which for a regulated audit
 * trail is a defect, not a cosmetic gap.
 *
 * `auditConstants.spec.js` reads the backend file from disk and fails, naming
 * the codes, if a backend action has no label / colour / icon here, if a value
 * disagrees with the backend, or if a code exists here that the backend never
 * emits. Do not hand-maintain the drift — add the code and run the spec.
 */

export const AUDIT_ACTIONS = {
  // Generic CRUD
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  // Status / lifecycle transitions
  DRAFT: 'DRAFT',
  SUBMIT_FOR_REVIEW: 'SUBMIT_FOR_REVIEW',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  ARCHIVE: 'ARCHIVE',
  OBSOLETE: 'OBSOLETE',
  SUPERSEDE: 'SUPERSEDE',
  SET_EFFECTIVE: 'SET_EFFECTIVE',
  PUBLISH: 'PUBLISH',
  RETIRE: 'RETIRE',
  // A tamper control going on, and coming off. `roles.locked` is enforced by a
  // DB trigger — a locked role cannot be edited — so unlock → edit → relock is
  // the whole bypass, and it has to be readable as such in the log rather than
  // as three ordinary edits.
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  CANCEL: 'CANCEL',
  CLOSE: 'CLOSE',
  // Physical destruction of a retained QC sample (e-signed).
  DISPOSE: 'DISPOSE',
  REOPEN: 'REOPEN',
  // CAPA effectiveness-check verdicts, kept out of generic APPROVE/REJECT.
  EFFECTIVENESS_VERIFIED: 'EFFECTIVENESS_VERIFIED',
  EFFECTIVENESS_FAILED: 'EFFECTIVENESS_FAILED',
  EFFECTIVENESS_EXTENDED: 'EFFECTIVENESS_EXTENDED',
  // Owner confirmed a document is still valid (ISO 9001 / 13485 audit signal).
  PERIODIC_REVIEW: 'PERIODIC_REVIEW',

  // Workflow instance lifecycle
  INITIATE: 'INITIATE',
  START_REVIEW: 'START_REVIEW',
  COMPLETE: 'COMPLETE',
  CANCEL_REVIEW: 'CANCEL_REVIEW',

  // Workflow instance steps
  STEP_PENDING: 'STEP_PENDING',
  STEP_IN_PROGRESS: 'STEP_IN_PROGRESS',
  STEP_APPROVED: 'STEP_APPROVED',
  STEP_REJECTED: 'STEP_REJECTED',
  STEP_CHANGES_REQUESTED: 'STEP_CHANGES_REQUESTED',
  STEP_SKIPPED: 'STEP_SKIPPED',
  STEP_CANCELLED: 'STEP_CANCELLED',
  STEP_DELAY_SCHEDULED: 'STEP_DELAY_SCHEDULED',
  STEP_DELAY_SKIPPED: 'STEP_DELAY_SKIPPED',
  STEP_DELAY_EXTENDED: 'STEP_DELAY_EXTENDED',
  STEP_SEND_BACK: 'STEP_SEND_BACK',

  // Workflow step user actions
  USER_APPROVED: 'USER_APPROVED',
  USER_REJECTED: 'USER_REJECTED',
  USER_CHANGES_REQUESTED: 'USER_CHANGES_REQUESTED',

  // Users & access
  INVITE: 'INVITE',
  BLOCK: 'BLOCK',
  // Company ownership. `users.is_owner` is the first short-circuit in every RLS
  // policy in the schema, so these two are the highest-authority events the
  // system can record — never fold them into a generic UPDATE row.
  GRANT_OWNERSHIP: 'GRANT_OWNERSHIP',
  REVOKE_OWNERSHIP: 'REVOKE_OWNERSHIP',

  // Tasks
  ASSIGN: 'ASSIGN',
  START: 'START',

  // Asset requests
  PENDING: 'PENDING',
  RECEIVE: 'RECEIVE',
  OVERDUE: 'OVERDUE',
  ACCEPT: 'ACCEPT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',

  // Suppliers
  UNDER_REVIEW: 'UNDER_REVIEW',

  // Products
  DISCONTINUE: 'DISCONTINUE',

  // API keys
  ROTATE: 'ROTATE',

  // Customer complaints
  SEND: 'SEND',
  CONVERT_TO_NC: 'CONVERT_TO_NC',
  EXPORT: 'EXPORT',
}

/**
 * Map: action code → Tailwind badge classes.
 *
 * Colour scheme — the bands are ranked by how much a reviewer scanning the log
 * needs to stop on the row, not by which module emitted it:
 *
 *  - red      Destructive or highest-authority: DELETE, DISPOSE (physical
 *             destruction), REJECT / BLOCK / EFFECTIVENESS_FAILED, and
 *             GRANT_OWNERSHIP — granting owner short-circuits every RLS policy
 *             in the schema, so it is louder than any content change.
 *  - amber    A control coming OFF or a decision bouncing back: UNLOCK,
 *             REVOKE_OWNERSHIP, REOPEN, *_CHANGES_REQUESTED, PENDING,
 *             EFFECTIVENESS_EXTENDED, STEP_DELAY_EXTENDED. Distinct from red so
 *             "someone removed a guard" doesn't read as "someone deleted a row".
 *  - orange   Time/attention pressure: OVERDUE, STEP_SEND_BACK.
 *  - green    Record or relationship created / accepted: CREATE, ACTIVATE,
 *             ACCEPT, ACKNOWLEDGED, CLOSE.
 *  - emerald  Formal approval and completion: APPROVE, *_APPROVED, COMPLETE,
 *             EFFECTIVENESS_VERIFIED.
 *  - blue     Work started / under review: SUBMIT_FOR_REVIEW, START*,
 *             STEP_IN_PROGRESS, INITIATE, UNDER_REVIEW.
 *  - indigo   Dispatch and assignment: PUBLISH, INVITE, ASSIGN,
 *             STEP_DELAY_SCHEDULED.
 *  - purple   Version/identity lineage: SUPERSEDE, SET_EFFECTIVE, CONVERT_TO_NC.
 *  - cyan     PERIODIC_REVIEW — the standing ISO evidence row.
 *  - teal     Data crossing the company boundary: SEND, RECEIVE.
 *  - gray     Terminal but unremarkable: ARCHIVE, CANCEL*, OBSOLETE, RETIRE,
 *             DISCONTINUE, DEACTIVATE, STEP_SKIPPED, STEP_CANCELLED.
 *  - slate    Routine, high-volume noise: UPDATE, DRAFT, LOCK, ROTATE, EXPORT.
 *
 * Values must match the backend map exactly where the backend defines one — the
 * spec asserts it. DISPOSE and STEP_SKIPPED have no backend colour; they are
 * chosen here (red / gray) and the spec only requires that they exist.
 */
export const ACTION_COLORS = {
  CREATE: 'tw:bg-green-100 tw:text-green-700',
  ACTIVATE: 'tw:bg-green-100 tw:text-green-700',
  ACCEPT: 'tw:bg-green-100 tw:text-green-700',
  ACKNOWLEDGED: 'tw:bg-green-100 tw:text-green-700',
  APPROVE: 'tw:bg-emerald-100 tw:text-emerald-700',
  STEP_APPROVED: 'tw:bg-emerald-100 tw:text-emerald-700',
  USER_APPROVED: 'tw:bg-emerald-100 tw:text-emerald-700',
  COMPLETE: 'tw:bg-emerald-100 tw:text-emerald-700',
  REJECT: 'tw:bg-red-100 tw:text-red-700',
  STEP_REJECTED: 'tw:bg-red-100 tw:text-red-700',
  USER_REJECTED: 'tw:bg-red-100 tw:text-red-700',
  STEP_SEND_BACK: 'tw:bg-orange-100 tw:text-orange-700',
  BLOCK: 'tw:bg-red-100 tw:text-red-700',
  DELETE: 'tw:bg-red-100 tw:text-red-700',
  // Irreversible physical destruction of a retained sample, e-signed. No
  // backend colour — red, same band as DELETE, because it is a DELETE of a
  // physical control article.
  DISPOSE: 'tw:bg-red-100 tw:text-red-700',
  GRANT_OWNERSHIP: 'tw:bg-red-100 tw:text-red-700',
  REVOKE_OWNERSHIP: 'tw:bg-amber-100 tw:text-amber-700',
  SUBMIT_FOR_REVIEW: 'tw:bg-blue-100 tw:text-blue-700',
  STEP_IN_PROGRESS: 'tw:bg-blue-100 tw:text-blue-700',
  INITIATE: 'tw:bg-blue-100 tw:text-blue-700',
  START_REVIEW: 'tw:bg-blue-100 tw:text-blue-700',
  START: 'tw:bg-blue-100 tw:text-blue-700',
  UNDER_REVIEW: 'tw:bg-blue-100 tw:text-blue-700',
  PUBLISH: 'tw:bg-indigo-100 tw:text-indigo-700',
  INVITE: 'tw:bg-indigo-100 tw:text-indigo-700',
  ASSIGN: 'tw:bg-indigo-100 tw:text-indigo-700',
  ARCHIVE: 'tw:bg-gray-100 tw:text-gray-700',
  DEACTIVATE: 'tw:bg-gray-100 tw:text-gray-700',
  CANCEL: 'tw:bg-gray-100 tw:text-gray-700',
  CLOSE: 'tw:bg-green-100 tw:text-green-700',
  REOPEN: 'tw:bg-amber-100 tw:text-amber-700',
  EFFECTIVENESS_VERIFIED: 'tw:bg-emerald-100 tw:text-emerald-700',
  EFFECTIVENESS_FAILED: 'tw:bg-red-100 tw:text-red-700',
  EFFECTIVENESS_EXTENDED: 'tw:bg-amber-100 tw:text-amber-700',
  STEP_DELAY_SCHEDULED: 'tw:bg-indigo-100 tw:text-indigo-700',
  STEP_DELAY_SKIPPED: 'tw:bg-gray-100 tw:text-gray-700',
  STEP_DELAY_EXTENDED: 'tw:bg-amber-100 tw:text-amber-700',
  CANCEL_REVIEW: 'tw:bg-gray-100 tw:text-gray-700',
  STEP_CANCELLED: 'tw:bg-gray-100 tw:text-gray-700',
  // No backend colour — gray, matching STEP_DELAY_SKIPPED: a step that never ran.
  STEP_SKIPPED: 'tw:bg-gray-100 tw:text-gray-700',
  OBSOLETE: 'tw:bg-gray-100 tw:text-gray-700',
  RETIRE: 'tw:bg-gray-100 tw:text-gray-700',
  DISCONTINUE: 'tw:bg-gray-100 tw:text-gray-700',
  REQUEST_CHANGES: 'tw:bg-amber-100 tw:text-amber-700',
  STEP_CHANGES_REQUESTED: 'tw:bg-amber-100 tw:text-amber-700',
  USER_CHANGES_REQUESTED: 'tw:bg-amber-100 tw:text-amber-700',
  PENDING: 'tw:bg-amber-100 tw:text-amber-700',
  STEP_PENDING: 'tw:bg-amber-100 tw:text-amber-700',
  OVERDUE: 'tw:bg-orange-100 tw:text-orange-700',
  SUPERSEDE: 'tw:bg-purple-100 tw:text-purple-700',
  SET_EFFECTIVE: 'tw:bg-purple-100 tw:text-purple-700',
  PERIODIC_REVIEW: 'tw:bg-cyan-100 tw:text-cyan-700',
  UPDATE: 'tw:bg-slate-100 tw:text-slate-700',
  DRAFT: 'tw:bg-slate-100 tw:text-slate-700',
  LOCK: 'tw:bg-slate-100 tw:text-slate-700',
  // Amber, not slate: LOCK is a control going on (unremarkable), UNLOCK is a
  // control coming off. Same reasoning as REVOKE_OWNERSHIP — the row a reviewer
  // must not scroll past.
  UNLOCK: 'tw:bg-amber-100 tw:text-amber-700',
  ROTATE: 'tw:bg-slate-100 tw:text-slate-700',
  RECEIVE: 'tw:bg-teal-100 tw:text-teal-700',
  SEND: 'tw:bg-teal-100 tw:text-teal-700',
  CONVERT_TO_NC: 'tw:bg-purple-100 tw:text-purple-700',
  EXPORT: 'tw:bg-slate-100 tw:text-slate-700',
}

/**
 * Map: action code → @tabler/icons-vue icon name (string).
 * Resolved dynamically by AuditLogActionBadge.vue, so a name that does not
 * exist in the package is a silent fallback to IconHistory, not a build error —
 * the spec checks every name against the installed package's exports.
 */
export const ACTION_ICONS = {
  CREATE: 'IconPlus',
  UPDATE: 'IconEdit',
  DELETE: 'IconTrash',
  // IconTrashX, not IconTrash: disposal is destruction of the physical article,
  // and must not read identically to deleting its record.
  DISPOSE: 'IconTrashX',
  DRAFT: 'IconPencil',
  ACTIVATE: 'IconCircleCheck',
  DEACTIVATE: 'IconCircleOff',
  APPROVE: 'IconCircleCheck',
  REJECT: 'IconCircleX',
  STEP_APPROVED: 'IconCircleCheck',
  USER_APPROVED: 'IconCircleCheck',
  STEP_REJECTED: 'IconCircleX',
  USER_REJECTED: 'IconCircleX',
  STEP_SEND_BACK: 'IconArrowBackUp',
  REQUEST_CHANGES: 'IconRefresh',
  STEP_CHANGES_REQUESTED: 'IconRefresh',
  USER_CHANGES_REQUESTED: 'IconRefresh',
  SUBMIT_FOR_REVIEW: 'IconSend',
  ARCHIVE: 'IconArchive',
  OBSOLETE: 'IconArchive',
  SUPERSEDE: 'IconArrowsExchange',
  SET_EFFECTIVE: 'IconCalendarCheck',
  PERIODIC_REVIEW: 'IconClipboardCheck',
  PUBLISH: 'IconWorldUpload',
  RETIRE: 'IconPlayerStop',
  BLOCK: 'IconBan',
  GRANT_OWNERSHIP: 'IconCrown',
  REVOKE_OWNERSHIP: 'IconCrownOff',
  INVITE: 'IconMail',
  ASSIGN: 'IconUserPlus',
  START: 'IconPlayerPlay',
  COMPLETE: 'IconFlagCheck',
  CANCEL: 'IconX',
  CLOSE: 'IconLock',
  REOPEN: 'IconRefreshAlert',
  EFFECTIVENESS_VERIFIED: 'IconCircleCheck',
  EFFECTIVENESS_FAILED: 'IconCircleX',
  EFFECTIVENESS_EXTENDED: 'IconCalendarTime',
  STEP_DELAY_SCHEDULED: 'IconCalendarTime',
  STEP_DELAY_SKIPPED: 'IconCalendarX',
  STEP_DELAY_EXTENDED: 'IconCalendarTime',
  CANCEL_REVIEW: 'IconX',
  INITIATE: 'IconRocket',
  START_REVIEW: 'IconPlayerPlay',
  PENDING: 'IconClock',
  RECEIVE: 'IconPackageImport',
  ACCEPT: 'IconCheck',
  ACKNOWLEDGED: 'IconCheck',
  OVERDUE: 'IconAlertTriangle',
  UNDER_REVIEW: 'IconEye',
  DISCONTINUE: 'IconPlayerStop',
  ROTATE: 'IconRefresh',
  LOCK: 'IconLock',
  UNLOCK: 'IconLockOpen',
  STEP_PENDING: 'IconClock',
  STEP_IN_PROGRESS: 'IconPlayerPlay',
  STEP_SKIPPED: 'IconArrowRight',
  STEP_CANCELLED: 'IconX',
  SEND: 'IconSend',
  CONVERT_TO_NC: 'IconTransform',
  EXPORT: 'IconDownload',
}

export const MODULE_OPTIONS = [
  { label: 'Document Control', value: 'DOCUMENT_CONTROL' },
  { label: 'Workflows', value: 'WORKFLOWS' },
  { label: 'Forms & Records', value: 'FORMS' },
  { label: 'Suppliers', value: 'SUPPLIERS' },
  { label: 'Asset Requests', value: 'ASSET_REQUESTS' },
  { label: 'Nonconformances', value: 'NONCONFORMANCES' },
  { label: 'Users & Access', value: 'USERS_ACCESS' },
  { label: 'Teams', value: 'TEAMS' },
  { label: 'Org / Departments', value: 'ORG' },
  { label: 'Products', value: 'PRODUCTS' },
  { label: 'Tasks', value: 'TASKS' },
  { label: 'Configuration', value: 'CONFIGURATION' },
  { label: 'Organization', value: 'ORGANIZATION' },
  { label: 'API Keys', value: 'API_KEYS' },
]

export const MODULE_META = {
  DOCUMENT_CONTROL: { label: 'Document Control', icon: 'IconFileText', color: 'tw:text-blue-600' },
  WORKFLOWS: { label: 'Workflows', icon: 'IconGitBranch', color: 'tw:text-purple-600' },
  FORMS: { label: 'Forms & Records', icon: 'IconClipboardList', color: 'tw:text-cyan-600' },
  SUPPLIERS: { label: 'Suppliers', icon: 'IconTruck', color: 'tw:text-orange-600' },
  ASSET_REQUESTS: { label: 'Asset Requests', icon: 'IconPackage', color: 'tw:text-amber-600' },
  NONCONFORMANCES: {
    label: 'Nonconformances',
    icon: 'IconAlertTriangle',
    color: 'tw:text-red-600',
  },
  USERS_ACCESS: { label: 'Users & Access', icon: 'IconUsers', color: 'tw:text-indigo-600' },
  TEAMS: { label: 'Teams', icon: 'IconUsersGroup', color: 'tw:text-teal-600' },
  ORG: { label: 'Org / Departments', icon: 'IconBuilding', color: 'tw:text-slate-600' },
  PRODUCTS: { label: 'Products', icon: 'IconBox', color: 'tw:text-lime-600' },
  TASKS: { label: 'Tasks', icon: 'IconChecklist', color: 'tw:text-pink-600' },
  CONFIGURATION: { label: 'Configuration', icon: 'IconSettings', color: 'tw:text-gray-600' },
  ORGANIZATION: { label: 'Organization', icon: 'IconBuildingEstate', color: 'tw:text-slate-600' },
  API_KEYS: { label: 'API Keys', icon: 'IconKey', color: 'tw:text-yellow-600' },
  OTHER: { label: 'Other', icon: 'IconDots', color: 'tw:text-gray-500' },
}

/**
 * Maps entity type (singular) → async (entityId, db) => { label, displayType, displayId } | null.
 * Returns null when the primary record cannot be found (even with force:true for paranoid models).
 * Returning null causes AuditLogsItem to hide the log entry entirely.
 * Child entity resolvers chain to their logical parent via `this`.
 * Must be called as ENTITY_LABEL_RESOLVERS[type].call(ENTITY_LABEL_RESOLVERS, id, db).
 */
export const ENTITY_LABEL_RESOLVERS = {
  async Document(id, db) {
    const e = await db.Document.findByPk(id, { force: true })
    return e
      ? { label: e.docNumber || e.title || id, displayType: 'Document', displayId: id }
      : null
  },

  async DocumentVersion(id, db) {
    const dv = await db.DocumentVersion.findByPk(id, { force: true })
    if (!dv) return null
    const doc = await db.Document.findByPk(dv.documentId, { force: true })
    const vLabel = dv.versionLabel || `${dv.versionMajor}.${dv.versionMinor}`
    const label = doc ? `${doc.docNumber || doc.title} v${vLabel}` : `v${vLabel}`
    return { label, displayType: 'DocumentVersion', displayId: id }
  },

  async DocumentTemplate(id, db) {
    const e = await db.DocumentTemplate.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'DocumentTemplate', displayId: id } : null
  },

  async DocumentSection(id, db) {
    const e = await db.DocumentSection.findByPk(id, { force: true })
    return e ? { label: e.title || id, displayType: 'DocumentSection', displayId: id } : null
  },

  async DocumentLink(id, db) {
    const e = await db.DocumentLink.findByPk(id, { force: true })
    if (!e) return null
    const dv = await db.DocumentVersion.findByPk(e.fromDocumentVersionId, { force: true })
    if (!dv) return null
    const doc = await db.Document.findByPk(dv.documentId, { force: true })
    const vLabel = dv.versionLabel || `${dv.versionMajor}.${dv.versionMinor}`
    const label = doc ? `${doc.docNumber || doc.title} v${vLabel}` : `v${vLabel}`
    return { label, displayType: 'DocumentLink', displayId: id }
  },

  async Workflow(id, db) {
    const e = await db.Workflow.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'Workflow', displayId: id } : null
  },

  async ApprovalWorkflowVersion(id, db) {
    return this.WorkflowVersion(id, db)
  },

  async WorkflowVersion(id, db) {
    const wv = await db.WorkflowVersion.findByPk(id, { force: true })
    if (!wv) return null
    const workflow = await db.Workflow.findByPk(wv.workflowId, { force: true })
    const vLabel = wv.versionLabel || `${wv.versionMajor}.${wv.versionMinor}`
    const label = workflow ? `${workflow.name} v${vLabel}` : `v${vLabel}`
    return { label, displayType: 'WorkflowVersion', displayId: id }
  },

  async WorkflowInstance(id, db) {
    const wi = await db.WorkflowInstance.findByPk(id, { force: true })
    if (!wi) return null
    const wv = await db.WorkflowVersion.findByPk(wi.workflowVersionId, { force: true })
    if (!wv) return null
    const workflow = await db.Workflow.findByPk(wv.workflowId, { force: true })
    return { label: workflow ? workflow.name : id, displayType: 'WorkflowInstance', displayId: id }
  },

  async ApprovalWorkflowInstance(id, db) {
    return this.WorkflowInstance(id, db)
  },

  async WorkflowInstanceStep(id, db) {
    const e = await db.WorkflowInstanceStep.findByPk(id, { force: true })
    return e
      ? { label: `Step ${e.stepNumber}`, displayType: 'WorkflowInstanceStep', displayId: id }
      : null
  },

  async ApprovalWorkflowInstanceStep(id, db) {
    const e = await db.WorkflowInstanceStep.findByPk(id, { force: true })
    return e ? this.WorkflowInstance(e.workflowInstanceId, db) : null
  },

  async UsersOnApprovalWorkflowInstanceStep(id, db) {
    const e = await db.UserOnWorkflowInstanceStep.findByPk(id, { force: true })
    return e ? this.WorkflowInstanceStep(e.workflowInstanceStepId, db) : null
  },

  async ApprovalWorkflowStep(id, db) {
    return this.WorkflowStep(id, db)
  },

  async WorkflowStep(id, db) {
    const e = await db.WorkflowStep.findByPk(id, { force: true })
    return e ? this.WorkflowVersion(e.workflowVersionId, db) : null
  },

  async WorkflowStepRole(id, db) {
    const e = await db.WorkflowStepRole.findByPk(id, { force: true })
    return e ? this.WorkflowStep(e.stepId, db) : null
  },

  async ApprovalWorkflowStepUser(id, db) {
    return this.WorkflowStepUser(id, db)
  },

  async WorkflowStepUser(id, db) {
    const e = await db.WorkflowStepUser.findByPk(id, { force: true })
    return e ? this.WorkflowStep(e.stepId, db) : null
  },

  async StepSendBackTarget(id, db) {
    const e = await db.StepSendBackTarget.findByPk(id, { force: true })
    return e ? this.WorkflowStep(e.stepId, db) : null
  },

  async StepsSendBackTarget(id, db) {
    return this.StepSendBackTarget(id, db)
  },

  async AllowedOutcomeOnStep(id, db) {
    const e = await db.AllowedOutcomeOnStep.findByPk(id, { force: true })
    return e ? this.WorkflowStep(e.stepId, db) : null
  },

  async AllowedOutcomesOnStep(id, db) {
    return this.AllowedOutcomeOnStep(id, db)
  },

  // Legacy permissions_on_roles was replaced by the native authz plane; the
  // client model no longer exists, so these audit entity types resolve to null
  // (no live record to link to). Native permission changes are audited via the
  // authz permission_audit_log surfaced through the Role audit drawer.
  async PermissionOnRole() {
    return null
  },

  async PermissionsOnRole() {
    return null
  },

  async FormTemplate(id, db) {
    const e = await db.FormTemplate.findByPk(id, { force: true })
    return e ? { label: e.title || e.code || id, displayType: 'FormTemplate', displayId: id } : null
  },

  async Record(id, db) {
    const e = await db.Record.findByPk(id, { force: true })
    return e ? { label: e.recordNumber || id, displayType: 'Record', displayId: id } : null
  },

  async Supplier(id, db) {
    const e = await db.Supplier.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'Supplier', displayId: id } : null
  },

  async SupplierDocument(id, db) {
    const sd = await db.SupplierDocument.findByPk(id, { force: true })
    if (!sd) return null
    const dv = await db.DocumentVersion.findByPk(sd.documentVersionId, { force: true })
    if (!dv) return null
    const doc = await db.Document.findByPk(dv.documentId, { force: true })
    const vLabel = dv.versionLabel || `${dv.versionMajor}.${dv.versionMinor}`
    const label = doc ? `${doc.docNumber || doc.title} v${vLabel}` : `v${vLabel}`
    return { label, displayType: 'SupplierDocument', displayId: id }
  },

  async SupplierAsset() {
    return null
  },

  async SupplierContact(id, db) {
    const e = await db.SupplierContact.findByPk(id, { force: true })
    return e ? { label: e.email || id, displayType: 'SupplierContact', displayId: id } : null
  },

  async AssetRequest(id, db) {
    const e = await db.AssetRequest.findByPk(id, { force: true })
    return e ? { label: e.title || id, displayType: 'AssetRequest', displayId: id } : null
  },

  async Nonconformance(id, db) {
    const e = await db.Nonconformance.findByPk(id, { force: true })
    return e
      ? { label: e.ncNumber || e.title || id, displayType: 'Nonconformance', displayId: id }
      : null
  },

  async QualityEvent(id, db) {
    const e = await db.QualityEvent.findByPk(id, { force: true })
    return e
      ? { label: e.eventNumber || e.title || id, displayType: 'QualityEvent', displayId: id }
      : null
  },

  async CustomerComplaint(id, db) {
    const e = await db.CustomerComplaint.findByPk(id, { force: true })
    return e
      ? {
          label: e.complaintNumber || e.subject || id,
          displayType: 'CustomerComplaint',
          displayId: id,
        }
      : null
  },

  // Conversation messages roll up to their parent complaint in the trail.
  async CustomerComplaintMessage(id, db) {
    const e = await db.CustomerComplaintMessage.findByPk(id, { force: true })
    if (!e) return null
    return this.CustomerComplaint(e.complaintId, db)
  },

  async User(id, db) {
    const e = await db.User.findByPk(id, { force: true })
    if (!e) return null
    const label = `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.email || id
    return { label, displayType: 'User', displayId: id }
  },

  async Role(id, db) {
    const e = await db.Role.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'Role', displayId: id } : null
  },

  async Team(id, db) {
    const e = await db.Team.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'Team', displayId: id } : null
  },

  async Department(id, db) {
    const e = await db.Department.findByPk(id, { force: true })
    return e ? { label: e.name || e.code || id, displayType: 'Department', displayId: id } : null
  },

  async Site(id, db) {
    const e = await db.Site.findByPk(id, { force: true })
    return e ? { label: e.name || e.code || id, displayType: 'Site', displayId: id } : null
  },

  async Product(id, db) {
    const e = await db.Product.findByPk(id, { force: true })
    return e ? { label: e.name || e.sku || id, displayType: 'Product', displayId: id } : null
  },

  async TaskInstance(id, db) {
    const task = await db.TaskInstance.findByPk(id, { force: true })
    if (!task) return null
    const entityResolver = this[task.entityType]
    if (entityResolver) {
      const resolved = await entityResolver.call(this, task.entityId, db)
      return resolved ? { label: resolved.label, displayType: 'TaskInstance', displayId: id } : null
    }
    return null
  },

  async Task(id, db) {
    return this.TaskInstance(id, db)
  },

  async Signature() {
    // No SyncEngine model for Signature — cannot resolve a label
    return null
  },

  async UsersOnDocument(id, db) {
    const e = await db.UserOnDocument.findByPk(id, { force: true })
    return e ? this.Document(e.documentId, db) : null
  },

  async RolesOnUser(id, db) {
    const e = await db.RoleOnUser.findByPk(id, { force: true })
    return e ? this.User(e.userId, db) : null
  },

  async UsersOnTeam(id, db) {
    const e = await db.UserOnTeam.findByPk(id, { force: true })
    return e ? this.Team(e.teamId, db) : null
  },

  async OptionSet(id, db) {
    const e = await db.OptionSet.findByPk(id, { force: true })
    return e ? { label: e.name || id, displayType: 'OptionSet', displayId: id } : null
  },

  async ApiKey(id, db) {
    const e = await db.ApiKey.findByPk(id, { force: true })
    return e ? { label: e.name || e.label || id, displayType: 'ApiKey', displayId: id } : null
  },

  async Comment(id, db) {
    const comment = await db.Comment.findByPk(id, { force: true })
    if (!comment) return null
    if (comment.commentType === 'DISCUSSION') return null
    const parentResolver = this[comment.objectType]
    const parent = parentResolver ? await parentResolver.call(this, comment.objectId, db) : null
    return {
      label: parent ? `Comment on ${parent.label}` : 'Comment',
      displayType: 'Comment',
      displayId: id,
    }
  },
}
