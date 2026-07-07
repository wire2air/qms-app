import {
  IconFileText,
  IconForms,
  IconMapPin,
  IconSitemap,
  IconUsersGroup,
  IconUser,
  IconShield,
  IconBuilding,
  IconList,
  IconTruck,
  IconPackage,
  IconLayoutGrid,
  IconSchool,
  IconSparkles,
  IconClipboardList,
  IconTool,
  IconHeadset,
  IconReplace,
  IconEye,
  IconClipboardCheck,
  IconChecklist,
  IconListDetails,
  IconBolt,
  IconShieldCheck,
} from '@tabler/icons-vue'

/**
 * Category configuration for permissions and other entities
 * Centralized metadata for consistent categorization across the app
 */

export const CATEGORY_METADATA = {
  records: {
    label: 'Records & Compliance',
    icon: IconFileText,
    description: 'Manage access for Records & Compliance',
  },
  formTemplates: {
    label: 'Form Templates',
    icon: IconForms,
    description: 'Manage access for Form Templates',
  },
  sites: {
    label: 'Sites',
    icon: IconMapPin,
    description: 'Manage access for Sites',
  },
  departments: {
    label: 'Departments',
    icon: IconSitemap,
    description: 'Manage access for Departments',
  },
  teams: {
    label: 'Teams',
    icon: IconUsersGroup,
    description: 'Manage access for Teams',
  },
  users: {
    label: 'Users',
    icon: IconUser,
    description: 'Manage access for Users',
  },
  roles: {
    label: 'Roles',
    icon: IconShield,
    description: 'Manage access for Roles',
  },
  company: {
    label: 'Company',
    icon: IconBuilding,
    description: 'Manage access for Company',
  },
  optionSets: {
    label: 'Option Sets',
    icon: IconList,
    description: 'Manage access for Option Sets',
  },
  documents: {
    label: 'Documents',
    icon: IconFileText,
    description: 'Manage access for Documents',
  },
  'document-templates': {
    label: 'Document Templates',
    icon: IconFileText,
    description: 'Manage access for Document Templates',
  },
  workflows: {
    label: 'Workflows',
    icon: IconSitemap,
    description: 'Manage access for Workflows',
  },
  suppliers: {
    label: 'Suppliers',
    icon: IconTruck,
    description: 'Manage access for Suppliers',
  },
  products: {
    // UI label is "Item Master" — industry-aligned (covers raw +
    // WIP + finished goods). Category key stays `products` to match
    // seeded permission rows (`products:create`, etc.). 2026-05-26
    // decision: UI labels only, no DB rename.
    label: 'Item Master',
    icon: IconPackage,
    description:
      'Manage access for the Item Master (raw materials, components, finished goods).',
  },
  nonconformances: {
    label: 'Nonconformances',
    icon: IconShield,
    description: 'Manage access for Nonconformances',
  },
  capas: {
    label: 'CAPAs',
    icon: IconShield,
    description: 'Manage access for CAPAs',
  },
  rcaTemplates: {
    label: 'RCA Templates',
    icon: IconSitemap,
    description: 'Manage access for RCA Templates',
  },
  riskAssessmentTemplates: {
    label: 'Risk Assessment Templates',
    icon: IconLayoutGrid,
    description: 'Manage access for Risk Assessment Templates',
  },
  trainings: {
    label: 'Training Library',
    icon: IconSchool,
    description: 'Manage access for Training Library',
  },
  trainingInstances: {
    label: 'Training Instances',
    icon: IconSchool,
    description: 'Manage access for Training Instances',
  },
  trainingMatrix: {
    label: 'Training Matrix',
    icon: IconSchool,
    description: 'Manage access for Training Matrix',
  },
  ai: {
    label: 'AI Assistant',
    icon: IconSparkles,
    description: 'AI sidecar: view usage, manage configuration, audit activity',
  },
  // Inspections & Logs module — Phase 1 + Phase 2 + Round 0 + Round 0.5.
  fieldRecords: {
    label: 'Log Entries',
    icon: IconClipboardList,
    description: 'Submit, read, edit, review, amend, void, and classify log entries.',
  },
  inspections: {
    label: 'Inspection Assignments',
    icon: IconClipboardList,
    description: 'Plan who fills which log book on what schedule; skip on behalf of others.',
  },
  logBooks: {
    label: 'Log Books',
    icon: IconClipboardList,
    description: 'Create and edit log book templates + manage log book categories.',
  },
  equipment: {
    label: 'Equipment',
    icon: IconTool,
    description: 'Manage the equipment catalog (instruments, machines, sensors).',
  },
  // Quality records
  customerComplaints: {
    label: 'Customer Complaints',
    icon: IconHeadset,
    description: 'Manage access for Customer Complaints',
  },
  changeRequests: {
    label: 'Change Requests',
    icon: IconReplace,
    description: 'Manage access for Change Requests',
  },
  qualityEvents: {
    label: 'Quality Events',
    icon: IconEye,
    description: 'Manage access for Quality Events',
  },
  // Audits
  audits: {
    label: 'Audits',
    icon: IconClipboardCheck,
    description: 'Manage access for Audits',
  },
  auditPrograms: {
    label: 'Audit Programs',
    icon: IconClipboardCheck,
    description: 'Manage access for Audit Programs',
  },
  auditStandards: {
    label: 'Audit Standards',
    icon: IconChecklist,
    description: 'Manage access for Audit Standards',
  },
  auditFindings: {
    label: 'Audit Findings',
    icon: IconShield,
    description: 'Manage access for Audit Findings',
  },
  auditEvidence: {
    label: 'Audit Evidence',
    icon: IconFileText,
    description: 'Upload and manage audit evidence',
  },
  auditStandardTypes: {
    label: 'Audit Standard Types',
    icon: IconList,
    description: 'Manage audit standard types',
  },
  auditFindingCategories: {
    label: 'Audit Finding Categories',
    icon: IconList,
    description: 'Manage audit finding categories',
  },
  trainingVerifications: {
    label: 'Training Verification',
    icon: IconSchool,
    description: 'Manage access for Training Verification',
  },
  // Administration
  customFields: {
    label: 'Custom Fields',
    icon: IconListDetails,
    description: 'Manage custom fields',
  },
  automationRules: {
    label: 'Automation Rules',
    icon: IconBolt,
    description: 'Manage automation & notification rules',
  },
  security: {
    label: 'Security',
    icon: IconShieldCheck,
    description: 'Manage organization security & user security state',
  },
  // Lookups & categories
  ncDispositionTypes: {
    label: 'NC Disposition Types',
    icon: IconList,
    description: 'Manage nonconformance disposition types',
  },
  ncIssueTypes: {
    label: 'NC Issue Types',
    icon: IconList,
    description: 'Manage nonconformance issue types',
  },
  hazardCategories: {
    label: 'Hazard Categories',
    icon: IconList,
    description: 'Manage hazard categories',
  },
  rootCauseCategories: {
    label: 'Root Cause Categories',
    icon: IconSitemap,
    description: 'Manage root cause categories',
  },
  supplierCertificateTypes: {
    label: 'Supplier Certificate Types',
    icon: IconTruck,
    description: 'Manage supplier certificate types',
  },
  relatedStandards: {
    label: 'Related Standards',
    icon: IconList,
    description: 'Configure related standards',
  },
}

// A category renders in the Roles editor ONLY if it appears in a section here.
// Any category with seeded permission rows that is missing from this list is
// invisible in the UI (grantable only via the API) — so every module with
// standard `category:action` permissions must be listed.
// NOTE: `qcInspection` (3-part ids like `qcInspection:lot:read`) and `portal`
// (external-supplier-only, non-CRUD actions) are intentionally NOT listed —
// the current checkbox matrix can't represent them; they need dedicated UI.
export const PERMISSION_SECTIONS = [
  {
    name: 'Company Management',
    categories: [
      'company',
      'users',
      'teams',
      'sites',
      'departments',
      'roles',
      'optionSets',
      'suppliers',
      'products',
      'security',
    ],
  },
  {
    name: 'Quality Records',
    categories: [
      'nonconformances',
      'capas',
      'changeRequests',
      'customerComplaints',
      'qualityEvents',
    ],
  },
  {
    name: 'Audits',
    categories: [
      'audits',
      'auditPrograms',
      'auditStandards',
      'auditFindings',
      'auditEvidence',
      'auditStandardTypes',
      'auditFindingCategories',
    ],
  },
  {
    name: 'Configuration',
    categories: [
      'formTemplates',
      'rcaTemplates',
      'riskAssessmentTemplates',
      'records',
      'documents',
      'document-templates',
      'workflows',
      'customFields',
      'automationRules',
    ],
  },
  {
    name: 'Lookups & Categories',
    categories: [
      'ncDispositionTypes',
      'ncIssueTypes',
      'hazardCategories',
      'rootCauseCategories',
      'supplierCertificateTypes',
      'relatedStandards',
    ],
  },
  {
    name: 'Training',
    categories: ['trainings', 'trainingInstances', 'trainingMatrix', 'trainingVerifications'],
  },
  {
    // I&L Round 0 sections — Log Entries / Log Books / Equipment /
    // Inspection Assignments. Permissions on each category come from
    // the seeded permission rows: `fieldRecords:create`,
    // `logBooks:update`, `equipment:create`, etc. Without this section
    // the rows exist in PG but the Roles UI hides them.
    name: 'Inspections & Logs',
    categories: ['fieldRecords', 'logBooks', 'inspections', 'equipment'],
  },
  {
    name: 'AI',
    categories: ['ai'],
  },
]

export const PERMISSION_ACTIONS_ORDER = ['create', 'read', 'update', 'delete', 'manage']

/**
 * Get category label
 * @param {string} category - Category key
 * @returns {string} Display label
 */
export function getCategoryLabel(category) {
  return CATEGORY_METADATA[category]?.label || category
}

/**
 * Get category icon
 * @param {string} category - Category key
 * @returns {string} Material icon name
 */
export function getCategoryIcon(category) {
  return CATEGORY_METADATA[category]?.icon || IconList
}

/**
 * Get category description
 * @param {string} category - Category key
 * @returns {string} Description text
 */
export function getCategoryDescription(category) {
  return CATEGORY_METADATA[category]?.description || `Manage access for ${category}`
}

/**
 * Format action label with proper capitalization
 * @param {string} action - Action key (create, read, update, delete)
 * @returns {string} Formatted label
 */
export function formatActionLabel(action) {
  if (!action) return ''
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}`
}
