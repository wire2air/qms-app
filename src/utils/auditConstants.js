/**
 * Frontend audit log constants — mirrors backend/shared/constants/auditActions.js.
 * Keep in sync when adding new action codes.
 */

export const AUDIT_ACTIONS = {
  // Generic CRUD
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  // Status transitions
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  ARCHIVE: 'ARCHIVE',
  RESTORE: 'RESTORE',

  // Document-specific
  DRAFT: 'DRAFT',
  SUBMIT_FOR_REVIEW: 'SUBMIT_FOR_REVIEW',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  OBSOLETE: 'OBSOLETE',

  // Workflow-specific
  INITIATE: 'INITIATE',
  STEP_PENDING: 'STEP_PENDING',
  STEP_APPROVED: 'STEP_APPROVED',
  STEP_REJECTED: 'STEP_REJECTED',
  USER_APPROVED: 'USER_APPROVED',
  USER_REJECTED: 'USER_REJECTED',
  COMPLETE: 'COMPLETE',
  REASSIGN: 'REASSIGN',

  // Supplier-specific
  BLOCK: 'BLOCK',
  REQUALIFY: 'REQUALIFY',
  SHARE_DOC: 'SHARE_DOC',

  // User/Access
  INVITE: 'INVITE',
  ASSIGN_ROLE: 'ASSIGN_ROLE',
  REVOKE_ROLE: 'REVOKE_ROLE',
  ASSIGN_TEAM: 'ASSIGN_TEAM',

  // NC-specific
  INVESTIGATE: 'INVESTIGATE',
  DISPOSITION: 'DISPOSITION',
  CLOSE: 'CLOSE',
  REOPEN: 'REOPEN',

  // Misc
  PUBLISH: 'PUBLISH',
  LOCK: 'LOCK',
  ROTATE: 'ROTATE',
  CANCEL: 'CANCEL',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
}

export const ACTION_COLORS = {
  CREATE: 'tw:bg-green-100 tw:text-green-700',
  ACTIVATE: 'tw:bg-green-100 tw:text-green-700',
  RESTORE: 'tw:bg-green-100 tw:text-green-700',
  REQUALIFY: 'tw:bg-green-100 tw:text-green-700',
  ACKNOWLEDGED: 'tw:bg-green-100 tw:text-green-700',
  APPROVE: 'tw:bg-emerald-100 tw:text-emerald-700',
  COMPLETE: 'tw:bg-emerald-100 tw:text-emerald-700',
  STEP_APPROVED: 'tw:bg-emerald-100 tw:text-emerald-700',
  USER_APPROVED: 'tw:bg-emerald-100 tw:text-emerald-700',
  REJECT: 'tw:bg-red-100 tw:text-red-700',
  BLOCK: 'tw:bg-red-100 tw:text-red-700',
  STEP_REJECTED: 'tw:bg-red-100 tw:text-red-700',
  USER_REJECTED: 'tw:bg-red-100 tw:text-red-700',
  DELETE: 'tw:bg-red-100 tw:text-red-700',
  SUBMIT_FOR_REVIEW: 'tw:bg-blue-100 tw:text-blue-700',
  INITIATE: 'tw:bg-blue-100 tw:text-blue-700',
  INVITE: 'tw:bg-indigo-100 tw:text-indigo-700',
  ASSIGN_ROLE: 'tw:bg-indigo-100 tw:text-indigo-700',
  ARCHIVE: 'tw:bg-gray-100 tw:text-gray-700',
  DEACTIVATE: 'tw:bg-gray-100 tw:text-gray-700',
  CANCEL: 'tw:bg-gray-100 tw:text-gray-700',
  OBSOLETE: 'tw:bg-gray-100 tw:text-gray-700',
  UPDATE: 'tw:bg-slate-100 tw:text-slate-700',
  DRAFT: 'tw:bg-slate-100 tw:text-slate-700',
}

export const ACTION_ICONS = {
  CREATE: 'IconCirclePlus',
  UPDATE: 'IconEdit',
  DELETE: 'IconTrash',
  ACTIVATE: 'IconCircleCheck',
  DEACTIVATE: 'IconCircleMinus',
  APPROVE: 'IconCircleCheck',
  REJECT: 'IconCircleX',
  ARCHIVE: 'IconArchive',
  INVITE: 'IconMail',
  SUBMIT_FOR_REVIEW: 'IconSend',
  DRAFT: 'IconEdit',
  PUBLISH: 'IconCircleCheck',
  COMPLETE: 'IconCircleCheck',
  BLOCK: 'IconBan',
  ROTATE: 'IconRefresh',
  CANCEL: 'IconBan',
  CLOSE: 'IconLock',
  REOPEN: 'IconLockOpen',
  ACKNOWLEDGED: 'IconCheck',
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

  async PermissionOnRole(id, db) {
    const e = await db.PermissionOnRole.findByPk(id, { force: true })
    return e ? this.Role(e.roleId, db) : null
  },

  async PermissionsOnRole(id, db) {
    return this.PermissionOnRole(id, db)
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
