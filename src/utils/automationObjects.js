// FE mirror of the worker automation object registry
// (backend/worker/services/automation/objectRegistry.js). Drives the rule
// builder's object / field / operator / action pickers. Keep the field `key`s
// (snake_case DB columns) in sync with the worker registry — the worker reads
// row[key] off the audit payload.

export const AUTOMATION_TRIGGERS = [
  { value: 'CREATED', label: 'When created' },
  { value: 'STATUS_CHANGED', label: 'When status changes' },
  { value: 'UPDATED', label: 'When updated' },
  { value: 'SCHEDULED', label: 'On a daily schedule (time-based)' },
]

export const OPERATORS_BY_TYPE = {
  string: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'like', label: 'like' },
    { value: 'not_like', label: 'not like' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: '=', label: '=' },
    { value: '!=', label: '≠' },
    { value: '>', label: '>' },
    { value: '>=', label: '≥' },
    { value: '<', label: '<' },
    { value: '<=', label: '≤' },
    { value: 'between', label: 'between' },
  ],
  date: [
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'older_than_days', label: 'older than (days)' },
    { value: 'within_days', label: 'within (days)' },
    { value: 'older_than_months', label: 'older than (months)' },
    { value: 'within_months', label: 'within (months)' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  boolean: [
    { value: 'is_true', label: 'is true' },
    { value: 'is_false', label: 'is false' },
  ],
  enum: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'in', label: 'is any of' },
    { value: 'not_in', label: 'is none of' },
  ],
  lookup: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'in', label: 'is any of' },
    { value: 'not_in', label: 'is none of' },
  ],
}

// Operators that take no value, and those that take a comma-separated list.
export const NO_VALUE_OPERATORS = new Set([
  'is_empty',
  'is_not_empty',
  'is_true',
  'is_false',
])
export const LIST_OPERATORS = new Set(['in', 'not_in', 'between'])

export const ACTION_TYPES = [
  { value: 'NOTIFY_GROUP', label: 'Notify Group', config: 'groups' },
  { value: 'NOTIFY_USER', label: 'Notify User(s)', config: 'users' },
  { value: 'NOTIFY_REQUESTER', label: 'Notify Requester', config: null },
  { value: 'NOTIFY_OWNER', label: 'Notify Owner / Assignee', config: null },
  { value: 'NOTIFY_EMAIL', label: 'Notify Email address(es)', config: 'emails' },
  // No config: a rule cannot name a supplier, because "tell the supplier"
  // means whichever supplier the record is about. The resolver reads
  // supplier_id off the row, then its flagged point(s) of contact — falling
  // back to every user at that supplier when none is flagged.
  { value: 'NOTIFY_SUPPLIER', label: 'Notify Supplier contact', config: null },
  { value: 'SEND_SMS', label: 'Send SMS/MMS', config: 'sms' },
  { value: 'CREATE_NC', label: 'Create Nonconformance', config: null },
  { value: 'CREATE_TASK', label: 'Create Task', config: 'task' },
]
export const ACTION_LABEL = Object.fromEntries(ACTION_TYPES.map((a) => [a.value, a.label]))

/** Notify-only actions — the set every object supports. */
const NOTIFY_ONLY = ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL']

export const AUTOMATION_OBJECTS = [
  {
    value: 'QualityEvent',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: 'supplier_id',
    siteField: 'site_id',
    departmentField: 'department_id',
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'QualityEventStatus',
    label: 'Events & Observations',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'category_id', label: 'Category', type: 'lookup', lookup: 'EventCategory' },
      { key: 'severity_id', label: 'Severity', type: 'lookup', lookup: 'EventSeverity' },
      { key: 'site_id', label: 'Site', type: 'lookup', lookup: 'Site' },
      { key: 'department_id', label: 'Department', type: 'lookup', lookup: 'Department' },
      { key: 'anonymous_submission', label: 'Anonymous', type: 'boolean' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
    ],
    allowedActions: ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL', 'NOTIFY_SUPPLIER', 'CREATE_NC'],
  },
  {
    value: 'Nonconformance',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: 'supplier_id',
    siteField: 'site_id',
    departmentField: 'department_id',
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'NcStatus',
    label: 'Nonconformances',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'severity_id', label: 'Severity', type: 'enum' },
      { key: 'type_id', label: 'Type', type: 'enum' },
      { key: 'source_id', label: 'Source', type: 'enum' },
      { key: 'site_id', label: 'Site', type: 'lookup', lookup: 'Site' },
      { key: 'department_id', label: 'Department', type: 'lookup', lookup: 'Department' },
      { key: 'is_supplier_facing', label: 'Supplier-facing', type: 'boolean' },
      { key: 'title', label: 'Title', type: 'string' },
    ],
    allowedActions: ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL', 'NOTIFY_SUPPLIER'],
  },
  {
    value: 'Capa',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: 'supplier_id',
    siteField: 'site_id',
    departmentField: 'department_id',
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'CapaStatus',
    label: 'CAPAs',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'priority_id', label: 'Priority', type: 'enum' },
      { key: 'type_id', label: 'Type', type: 'enum' },
      { key: 'source_type', label: 'Source', type: 'enum' },
      { key: 'site_id', label: 'Site', type: 'lookup', lookup: 'Site' },
      { key: 'department_id', label: 'Department', type: 'lookup', lookup: 'Department' },
      { key: 'title', label: 'Title', type: 'string' },
    ],
    allowedActions: ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL', 'NOTIFY_SUPPLIER'],
  },
  {
    value: 'ChangeRequest',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: null,
    siteField: 'site_id',
    departmentField: 'department_id',
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'ChangeRequestStatus',
    label: 'Change Control',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'priority_id', label: 'Priority', type: 'enum' },
      { key: 'change_type_id', label: 'Change Type', type: 'enum' },
      { key: 'site_id', label: 'Site', type: 'lookup', lookup: 'Site' },
      { key: 'department_id', label: 'Department', type: 'lookup', lookup: 'Department' },
      { key: 'title', label: 'Title', type: 'string' },
    ],
    allowedActions: ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL'],
  },
  {
    value: 'CustomerComplaint',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: null,
    siteField: null,
    departmentField: null,
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'CustomerComplaintStatus',
    label: 'Customer Complaints',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'priority_id', label: 'Priority', type: 'enum' },
      { key: 'source_id', label: 'Source', type: 'enum' },
      { key: 'customer_phone', label: 'Customer phone', type: 'string' },
      { key: 'subject', label: 'Subject', type: 'string' },
    ],
    allowedActions: ['NOTIFY_GROUP', 'NOTIFY_USER', 'NOTIFY_REQUESTER', 'NOTIFY_OWNER', 'NOTIFY_EMAIL', 'SEND_SMS'],
  },
  {
    // The QMS Complaint module — the live one. `CustomerComplaint` above is the
    // older ticketing entity: no records, dormant module. The builder offered
    // that and not this, so a rule about the complaints people actually raise
    // could not be written (reported 2026-08-20).
    value: 'Complaint',
    label: 'Complaints',
    supplierField: 'supplier_id',
    siteField: 'site_id',
    departmentField: null,
    statusModel: 'ComplaintStatus',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'severity_id', label: 'Severity', type: 'lookup', lookup: 'ComplaintSeverity' },
      { key: 'risk_level_id', label: 'Risk Level', type: 'lookup', lookup: 'ComplaintRiskLevel' },
      { key: 'category_id', label: 'Category', type: 'lookup', lookup: 'ComplaintCategory' },
      { key: 'safety_issue', label: 'Safety issue', type: 'boolean' },
      { key: 'regulatory_reportable', label: 'Regulatory reportable', type: 'boolean' },
      { key: 'subject', label: 'Subject', type: 'string' },
    ],
    allowedActions: [...NOTIFY_ONLY, 'NOTIFY_SUPPLIER'],
  },
  // Added 2026-08-19 alongside the worker registry. Both were missing, which is
  // why "notify QA when a QC lot is rejected" could not be expressed at all.
  {
    value: 'InspectionLot',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: 'supplier_id',
    siteField: null,
    departmentField: null,
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'InspectionLotStatus',
    label: 'QC Inspection Lots',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'quality_state', label: 'Quality state', type: 'enum' },
      { key: 'disposition_type_id', label: 'Disposition', type: 'lookup' },
      { key: 'product_id', label: 'Item', type: 'lookup', lookup: 'Product' },
      { key: 'supplier_id', label: 'Supplier', type: 'lookup', lookup: 'Supplier' },
      { key: 'inspection_point', label: 'Inspection point', type: 'enum' },
      { key: 'coa_received', label: 'CoA received', type: 'boolean' },
      { key: 'lot_number', label: 'Lot number', type: 'string' },
    ],
    allowedActions: [...NOTIFY_ONLY, 'NOTIFY_SUPPLIER'],
  },
  {
    value: 'AuditInstance',
    // Which columns the record ACTUALLY carries — mirrored from the worker
    // registry. Distinct from `fields` below, which is what may be used in a
    // CONDITION: an NC has a supplier_id without offering it as a filter, so
    // reading the fields list to answer 'does this record have a supplier'
    // silently said no.
    supplierField: 'supplier_id',
    siteField: 'site_id',
    departmentField: 'department_id',
    // Where the Status dropdown's options come from — a real lookup table,
    // so the rule builder can enumerate them instead of asking for typed text.
    statusModel: 'AuditInstanceStatus',
    label: 'Audits',
    fields: [
      { key: 'status_id', label: 'Status', type: 'enum' },
      { key: 'site_id', label: 'Site', type: 'lookup', lookup: 'Site' },
      { key: 'department_id', label: 'Department', type: 'lookup', lookup: 'Department' },
      { key: 'supplier_id', label: 'Supplier', type: 'lookup', lookup: 'Supplier' },
      { key: 'program_type_id', label: 'Programme type', type: 'lookup' },
      { key: 'scheduled_date', label: 'Scheduled date', type: 'date' },
      { key: 'scope', label: 'Scope', type: 'string' },
    ],
    allowedActions: [...NOTIFY_ONLY, 'NOTIFY_SUPPLIER'],
  },
]

export const OBJECT_BY_VALUE = Object.fromEntries(AUTOMATION_OBJECTS.map((o) => [o.value, o]))

export function fieldsForObject(objectType) {
  return OBJECT_BY_VALUE[objectType]?.fields ?? []
}
export function operatorsForField(objectType, fieldKey) {
  const f = fieldsForObject(objectType).find((x) => x.key === fieldKey)
  return OPERATORS_BY_TYPE[f?.type || 'string'] ?? OPERATORS_BY_TYPE.string
}
export function actionsForObject(objectType) {
  const allowed = new Set(OBJECT_BY_VALUE[objectType]?.allowedActions ?? [])
  return ACTION_TYPES.filter((a) => allowed.has(a.value))
}

// ── Module (admin-defined form) automation ───────────────────────────────────
// Module rules condition on the form's own fields + a few whitelisted first-class
// fields (Status, DateCreated, DateCompleted, DueDate). Field keys match the
// flattened evaluation row: form fields by name (hoisted from payload), first-
// class by column. Actions are the notify set.

export const MODULE_FIRST_CLASS_FIELDS = [
  { key: 'status_id', label: 'Status', type: 'enum' },
  { key: 'created_at', label: 'Date Created', type: 'date' },
  { key: 'completed_at', label: 'Date Completed', type: 'date' },
  { key: 'due_date', label: 'Due Date', type: 'date' },
  { key: 'next_review_date', label: 'Next Review Date', type: 'date' },
]

// Scoring fields, only offered when the module has rating bands configured. Keys
// match the worker's buildModuleEvalRow hoist (scoring_total / scoring_rating).
function moduleScoringFields(moduleConfig) {
  const bands = moduleConfig?.scoring?.bands
  if (!bands?.length) return []
  return [
    { key: 'scoring_total', label: 'Score', type: 'number' },
    {
      key: 'scoring_rating',
      label: 'Rating',
      type: 'enum',
      options: bands.map((b) => ({ value: b.label, label: b.label })),
    },
  ]
}

const FORM_TYPE_TO_AUTOMATION = {
  input: 'string',
  text: 'string',
  textarea: 'string',
  email: 'string',
  phone: 'string',
  url: 'string',
  number: 'number',
  currency: 'number',
  date: 'date',
  datetime: 'date',
  time: 'date',
  select: 'enum',
  dropdown: 'enum',
  radio: 'enum',
  multiselect: 'enum',
  checkbox: 'boolean',
  switch: 'boolean',
  toggle: 'boolean',
}

/** Normalize a form option (plain string or { value/label } object) to { value, label }. */
function toOption(o) {
  if (o && typeof o === 'object') {
    const value = o.value ?? o.id ?? o.label ?? o.name
    return { value, label: o.label ?? o.name ?? String(value) }
  }
  return { value: o, label: String(o) }
}

/**
 * Condition fields for a module form = first-class + scoring (when bands exist)
 * + form schema fields.
 */
export function moduleAutomationFields(schema, moduleConfig = null) {
  const out = []
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (Array.isArray(n?.children)) walk(n.children)
      const type = FORM_TYPE_TO_AUTOMATION[n?.type]
      if (type && n?.name) {
        const field = { key: n.name, label: n.label || n.name, type }
        // Carry the option choices so the rule builder can offer a real
        // dropdown (single/multi by operator) instead of a free-text value.
        if (type === 'enum' && Array.isArray(n.options) && n.options.length) {
          field.options = n.options.map(toOption)
        }
        out.push(field)
      }
    }
  }
  walk(schema || [])
  return [...MODULE_FIRST_CLASS_FIELDS, ...moduleScoringFields(moduleConfig), ...out]
}

export function moduleOperatorsForField(moduleFields, fieldKey) {
  const f = (moduleFields || []).find((x) => x.key === fieldKey)
  return OPERATORS_BY_TYPE[f?.type || 'string'] ?? OPERATORS_BY_TYPE.string
}

const MODULE_ALLOWED_ACTIONS = [
  'NOTIFY_GROUP',
  'NOTIFY_USER',
  'NOTIFY_REQUESTER',
  'NOTIFY_OWNER',
  'CREATE_TASK',
]
export const MODULE_ACTIONS = ACTION_TYPES.filter((a) => MODULE_ALLOWED_ACTIONS.includes(a.value))
