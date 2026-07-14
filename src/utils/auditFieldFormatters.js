/**
 * Central field-metadata registry for the audit diff viewer.
 *
 * Each entry: { label, type, refModel?, statusModel?, enumMap?, hidden? }
 *
 * Types:
 *  'text'     — plain string
 *  'fk'       — foreign key UUID; refModel = key in ENTITY_LABEL_RESOLVERS
 *  'status'   — status UUID; statusModel = IDB model name (e.g. 'DocumentStatus')
 *  'date'     — date-only ISO string
 *  'datetime' — full datetime ISO string
 *  'boolean'  — true/false → Yes/No
 *  'enum'     — fixed set; provide enumMap: { CODE: 'Label' }
 *  'json'     — arbitrary JSON object/array
 */

export const HIDDEN_AUDIT_FIELDS = new Set([
  'id',
  'companyId',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'updatedBy',
  'version',
  'isCurrent',
])

export function isHiddenField(fieldName) {
  return HIDDEN_AUDIT_FIELDS.has(fieldName) || fieldName.startsWith('__')
}

export const AUDIT_FIELD_FORMATTERS = {
  // ── Document Control ────────────────────────────────────────────────────────
  Document: {
    docNumber: { label: 'Document Number', type: 'text' },
    title: { label: 'Title', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'DocumentStatus' },
    departmentId: { label: 'Department', type: 'fk', refModel: 'Department' },
    documentTypeId: { label: 'Document Type', type: 'fk', refModel: 'DocumentType' },
    templateId: { label: 'Template', type: 'fk', refModel: 'DocumentTemplate' },
    effectiveDate: { label: 'Effective Date', type: 'date' },
    versionMajor: { label: 'Version Major', type: 'text' },
    versionMinor: { label: 'Version Minor', type: 'text' },
    description: { label: 'Description', type: 'text' },
    siteId: { label: 'Site', type: 'fk', refModel: 'Site' },
  },

  DocumentVersion: {
    versionMajor: { label: 'Version Major', type: 'text' },
    versionMinor: { label: 'Version Minor', type: 'text' },
    versionLabel: { label: 'Version Label', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'DocumentVersionStatus' },
    effectiveDate: { label: 'Effective Date', type: 'date' },
    documentId: { label: 'Document', type: 'fk', refModel: 'Document' },
  },

  DocumentTemplate: {
    name: { label: 'Name', type: 'text' },
    code: { label: 'Code', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'DocumentTemplateStatus' },
    documentTypeId: { label: 'Document Type', type: 'fk', refModel: 'DocumentType' },
    description: { label: 'Description', type: 'text' },
  },

  DocumentSection: {
    title: { label: 'Title', type: 'text' },
    content: { label: 'Content', type: 'text' },
    displayOrder: { label: 'Order', type: 'text' },
    documentVersionId: { label: 'Document Version', type: 'fk', refModel: 'DocumentVersion' },
  },

  DocumentLink: {
    fromDocumentVersionId: { label: 'From Document', type: 'fk', refModel: 'DocumentVersion' },
    toDocumentVersionId: { label: 'To Document', type: 'fk', refModel: 'DocumentVersion' },
    linkType: { label: 'Link Type', type: 'text' },
  },

  // ── Workflows ────────────────────────────────────────────────────────────────
  Workflow: {
    name: { label: 'Workflow Name', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowStatus' },
    description: { label: 'Description', type: 'text' },
  },

  WorkflowVersion: {
    versionMajor: { label: 'Version Major', type: 'text' },
    versionMinor: { label: 'Version Minor', type: 'text' },
    versionLabel: { label: 'Version Label', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowVersionStatus' },
    workflowId: { label: 'Workflow', type: 'fk', refModel: 'Workflow' },
  },

  WorkflowStep: {
    name: { label: 'Step Name', type: 'text' },
    displayOrder: { label: 'Step Order', type: 'text' },
    workflowVersionId: { label: 'Workflow Version', type: 'fk', refModel: 'WorkflowVersion' },
    description: { label: 'Description', type: 'text' },
    requireSignature: { label: 'Requires Signature', type: 'boolean' },
    requireComment: { label: 'Requires Comment', type: 'boolean' },
  },

  WorkflowStepRole: {
    stepId: { label: 'Step', type: 'fk', refModel: 'WorkflowStep', hidden: true },
    roleId: { label: 'Role', type: 'fk', refModel: 'Role' },
  },

  WorkflowStepUser: {
    stepId: { label: 'Step', type: 'fk', refModel: 'WorkflowStep', hidden: true },
    userId: { label: 'User', type: 'fk', refModel: 'User' },
  },

  WorkflowInstance: {
    workflowVersionId: { label: 'Workflow', type: 'fk', refModel: 'WorkflowVersion' },
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowInstanceStatus' },
    resourceType: { label: 'Resource Type', type: 'text' },
    resourceId: { label: 'Resource ID', type: 'text' },
  },

  WorkflowInstanceStep: {
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowInstanceStepStatus' },
    stepNumber: { label: 'Step Number', type: 'text' },
    workflowInstanceId: {
      label: 'Workflow Instance',
      type: 'fk',
      refModel: 'WorkflowInstance',
      hidden: true,
    },
  },

  ApprovalWorkflowInstance: {
    workflowVersionId: { label: 'Workflow', type: 'fk', refModel: 'WorkflowVersion' },
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowInstanceStatus' },
    resourceType: { label: 'Resource Type', type: 'text' },
    resourceId: { label: 'Resource ID', type: 'text' },
    submittedBy: { label: 'Submitted By', type: 'fk', refModel: 'User' },
    startedAt: { label: 'Started At', type: 'datetime' },
    completedAt: { label: 'Completed At', type: 'datetime' },
    comment: { label: 'Comment', type: 'text' },
  },

  ApprovalWorkflowInstanceStep: {
    statusId: { label: 'Status', type: 'status', statusModel: 'WorkflowInstanceStepStatus' },
    stepNumber: { label: 'Step Number', type: 'text' },
    workflowInstanceId: {
      label: 'Workflow Instance',
      type: 'fk',
      refModel: 'WorkflowInstance',
      hidden: true,
    },
    startedAt: { label: 'Started At', type: 'datetime' },
    completedAt: { label: 'Completed At', type: 'datetime' },
  },

  UsersOnApprovalWorkflowInstanceStep: {
    workflowInstanceStepId: {
      label: 'Approval Step',
      type: 'fk',
      refModel: 'WorkflowInstanceStep',
      hidden: true,
    },
    userId: { label: 'User', type: 'fk', refModel: 'User' },
    statusId: {
      label: 'Status',
      type: 'status',
      statusModel: 'WorkflowInstanceStepUserStatus',
    },
  },

  StepSendBackTarget: {
    stepId: { label: 'Step', type: 'fk', refModel: 'WorkflowStep', hidden: true },
    targetStepId: { label: 'Target Step', type: 'fk', refModel: 'WorkflowStep' },
  },

  AllowedOutcomeOnStep: {
    stepId: { label: 'Step', type: 'fk', refModel: 'WorkflowStep', hidden: true },
    outcome: { label: 'Outcome', type: 'text' },
    label: { label: 'Label', type: 'text' },
  },

  // ── Forms & Records ──────────────────────────────────────────────────────────
  FormTemplate: {
    title: { label: 'Title', type: 'text' },
    code: { label: 'Code', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'FormStatus' },
    documentTypeId: { label: 'Document Type', type: 'fk', refModel: 'DocumentType' },
    description: { label: 'Description', type: 'text' },
  },

  Record: {
    recordNumber: { label: 'Record Number', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'RecordStatus' },
    formTemplateId: { label: 'Form Template', type: 'fk', refModel: 'FormTemplate' },
    submittedAt: { label: 'Submitted At', type: 'datetime' },
  },

  // ── Suppliers ────────────────────────────────────────────────────────────────
  Supplier: {
    name: { label: 'Supplier Name', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'SupplierStatus' },
    qualificationStatus: { label: 'Qualification Status', type: 'text' },
    expiryDate: { label: 'Expiry Date', type: 'date' },
    email: { label: 'Email', type: 'text' },
    phone: { label: 'Phone', type: 'text' },
    address: { label: 'Address', type: 'text' },
  },

  SupplierDocument: {
    title: { label: 'Title', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'DocumentStatus' },
    expiryDate: { label: 'Expiry Date', type: 'date' },
    documentVersionId: { label: 'Document', type: 'fk', refModel: 'DocumentVersion', hidden: true },
    supplierId: { label: 'Supplier', type: 'fk', refModel: 'Supplier', hidden: true },
  },

  SupplierContact: {
    name: { label: 'Name', type: 'text' },
    email: { label: 'Email', type: 'text' },
    phone: { label: 'Phone', type: 'text' },
    role: { label: 'Role', type: 'text' },
    supplierId: { label: 'Supplier', type: 'fk', refModel: 'Supplier', hidden: true },
  },

  SupplierAsset: {
    name: { label: 'Name', type: 'text' },
    description: { label: 'Description', type: 'text' },
    supplierId: { label: 'Supplier', type: 'fk', refModel: 'Supplier', hidden: true },
  },

  // ── Asset Requests ───────────────────────────────────────────────────────────
  AssetRequest: {
    title: { label: 'Title', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'AssetRequestStatus' },
    requestedById: { label: 'Requested By', type: 'fk', refModel: 'User' },
    dueDate: { label: 'Due Date', type: 'date' },
    description: { label: 'Description', type: 'text' },
    supplierId: { label: 'Supplier', type: 'fk', refModel: 'Supplier' },
  },

  // ── Nonconformances ──────────────────────────────────────────────────────────
  Nonconformance: {
    title: { label: 'Title', type: 'text' },
    ncNumber: { label: 'NC Number', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'NcStatus' },
    typeId: { label: 'Type', type: 'text' },
    severityId: { label: 'Severity', type: 'text' },
    sourceId: { label: 'Source', type: 'text' },
    description: { label: 'Description', type: 'text' },
    detectedAt: { label: 'Detected At', type: 'date' },
    siteId: { label: 'Site', type: 'fk', refModel: 'Site' },
    departmentId: { label: 'Department', type: 'fk', refModel: 'Department' },
    reportedById: { label: 'Reported By', type: 'fk', refModel: 'User' },
  },

  // ── Customer Complaints ──────────────────────────────────────────────────────
  CustomerComplaint: {
    subject: { label: 'Subject', type: 'text' },
    complaintNumber: { label: 'Ticket Number', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'CustomerComplaintStatus' },
    priorityId: { label: 'Priority', type: 'text' },
    sourceId: { label: 'Source', type: 'text' },
    description: { label: 'Description', type: 'text' },
    customerName: { label: 'Customer Name', type: 'text' },
    customerEmail: { label: 'Customer Email', type: 'text' },
    assignedTo: { label: 'Assigned To', type: 'fk', refModel: 'User' },
  },

  // ── Users & Access ───────────────────────────────────────────────────────────
  User: {
    firstName: { label: 'First Name', type: 'text' },
    lastName: { label: 'Last Name', type: 'text' },
    email: { label: 'Email', type: 'text' },
    userStatusId: { label: 'Status', type: 'status', statusModel: 'UserStatus' },
    jobTitle: { label: 'Employee Title', type: 'text' },
    // FK mirrors jobTitle (which carries the readable name) — hide to avoid
    // double-reporting the same title change.
    employeeTitleId: { label: 'Employee Title', type: 'fk', refModel: 'EmployeeTitle', hidden: true },
    departmentId: { label: 'Department', type: 'fk', refModel: 'Department' },
    siteId: { label: 'Site', type: 'fk', refModel: 'Site' },
    supervisorId: { label: 'Supervisor', type: 'fk', refModel: 'User' },
    hireDate: { label: 'Hire Date', type: 'text' },
  },

  Role: {
    name: { label: 'Role Name', type: 'text' },
    description: { label: 'Description', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'RoleStatus' },
  },

  PermissionOnRole: {
    roleId: { label: 'Role', type: 'fk', refModel: 'Role', hidden: true },
    permissionId: { label: 'Permission', type: 'text' },
  },

  UsersOnDocument: {
    userId: { label: 'User', type: 'fk', refModel: 'User' },
    documentId: { label: 'Document', type: 'fk', refModel: 'Document', hidden: true },
  },

  RolesOnUser: {
    userId: { label: 'User', type: 'fk', refModel: 'User', hidden: true },
    roleId: { label: 'Role', type: 'fk', refModel: 'Role' },
  },

  UsersOnTeam: {
    userId: { label: 'User', type: 'fk', refModel: 'User' },
    teamId: { label: 'Team', type: 'fk', refModel: 'Team', hidden: true },
  },

  Team: {
    name: { label: 'Team Name', type: 'text' },
    statusId: { label: 'Status', type: 'text' },
    departmentId: { label: 'Department', type: 'fk', refModel: 'Department' },
  },

  // ── Organisation ────────────────────────────────────────────────────────────
  Department: {
    name: { label: 'Name', type: 'text' },
    code: { label: 'Code', type: 'text' },
    statusId: { label: 'Status', type: 'text' },
    parentId: { label: 'Parent Department', type: 'fk', refModel: 'Department' },
  },

  Site: {
    name: { label: 'Name', type: 'text' },
    code: { label: 'Code', type: 'text' },
    statusId: { label: 'Status', type: 'text' },
    address: { label: 'Address', type: 'text' },
  },

  // ── Products ─────────────────────────────────────────────────────────────────
  Product: {
    name: { label: 'Name', type: 'text' },
    code: { label: 'Code', type: 'text' },
    sku: { label: 'SKU', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'ProductStatus' },
    productTypeId: { label: 'Product Type', type: 'text' },
    description: { label: 'Description', type: 'text' },
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  get Task() {
    return this.TaskInstance
  },

  TaskInstance: {
    title: { label: 'Title', type: 'text' },
    statusId: { label: 'Status', type: 'status', statusModel: 'TaskInstanceStatus' },
    assigneeId: { label: 'Assigned To', type: 'fk', refModel: 'User' },
    dueDate: { label: 'Due Date', type: 'date' },
    priority: { label: 'Priority', type: 'text' },
    description: { label: 'Description', type: 'text' },
  },

  Signature: {
    userId: { label: 'Signed By', type: 'fk', refModel: 'User' },
    taskInstanceId: { label: 'Task', type: 'fk', refModel: 'TaskInstance', hidden: true },
    meaning: { label: 'Meaning', type: 'text' },
    comments: { label: 'Comments', type: 'text' },
    signedAt: { label: 'Signed At', type: 'datetime' },
    isRevoked: { label: 'Revoked', type: 'boolean' },
    revokedAt: { label: 'Revoked At', type: 'datetime' },
    revokedReason: { label: 'Revoke Reason', type: 'text' },
  },

  // ── Configuration ────────────────────────────────────────────────────────────
  OptionSet: {
    name: { label: 'Name', type: 'text' },
    code: { label: 'Code', type: 'text' },
    statusId: { label: 'Status', type: 'text' },
    options: { label: 'Options', type: 'json' },
  },

  ApiKey: {
    label: { label: 'Label', type: 'text' },
    stateId: { label: 'State', type: 'text' },
    expiresAt: { label: 'Expires At', type: 'date' },
  },

  Company: {
    name: { label: 'Company Name', type: 'text' },
    statusId: { label: 'Status', type: 'text' },
    subdomain: { label: 'Subdomain', type: 'text' },
  },
}

/**
 * Backwards-compatible re-export of AUDIT_FIELD_LABELS.
 * Existing code that imports AUDIT_FIELD_LABELS continues to work unchanged.
 */
export const AUDIT_FIELD_LABELS = Object.fromEntries(
  Object.entries(AUDIT_FIELD_FORMATTERS).map(([type, fields]) => [
    type,
    Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.label])),
  ]),
)

/**
 * Human-readable display names for entity types (singular PascalCase).
 * Used in summary sentences and the entity-type badge.
 */
export const DISPLAY_TYPE_LABELS = {
  Document: 'Document',
  DocumentVersion: 'Document Version',
  DocumentTemplate: 'Document Template',
  DocumentSection: 'Document Section',
  DocumentLink: 'Document Link',
  Workflow: 'Workflow',
  WorkflowVersion: 'Workflow Version',
  WorkflowStep: 'Workflow Step',
  WorkflowStepRole: 'Step Role',
  WorkflowStepUser: 'Step User',
  WorkflowInstance: 'Workflow Instance',
  WorkflowInstanceStep: 'Workflow Step Instance',
  StepSendBackTarget: 'Send-Back Target',
  AllowedOutcomeOnStep: 'Step Outcome',
  FormTemplate: 'Form Template',
  Record: 'Record',
  Supplier: 'Supplier',
  SupplierDocument: 'Supplier Document',
  SupplierContact: 'Supplier Contact',
  SupplierAsset: 'Supplier Asset',
  AssetRequest: 'Asset Request',
  Nonconformance: 'Nonconformance',
  CustomerComplaint: 'Customer Complaint',
  CustomerComplaintMessage: 'Complaint Message',
  User: 'User',
  Role: 'Role',
  PermissionOnRole: 'Permission',
  Team: 'Team',
  Department: 'Department',
  Site: 'Site',
  Product: 'Product',
  TaskInstance: 'Task',
  Task: 'Task',
  ApprovalWorkflowInstance: 'Approval Workflow',
  ApprovalWorkflowInstanceStep: 'Approval Step',
  UsersOnApprovalWorkflowInstanceStep: 'Approver Assignment',
  UsersOnDocument: 'Document Access',
  RolesOnUser: 'Role Assignment',
  UsersOnTeam: 'Team Member',
  Signature: 'Signature',
  OptionSet: 'Option Set',
  ApiKey: 'API Key',
  Company: 'Company',
}
