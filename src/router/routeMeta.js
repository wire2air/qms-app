/**
 * Route-metadata registry (Enterprise Page Framework B7).
 *
 * Single source of truth for page title · icon · breadcrumb parent · permission,
 * keyed by path PATTERN (`:param` placeholders). Consumed by `useRouteMeta()` to
 * drive document.title and breadcrumbs without each page hand-wiring them, and
 * (later) the command palette's navigation entries.
 *
 * Additive + incremental: unmatched routes simply resolve to no meta (title/
 * breadcrumbs stay as they are today). Add entries as modules are folded in.
 * Detail patterns use a function `title` so a page can feed the real record name
 * via `useRouteMeta().setRecordTitle(name)` (falls back to a generic label).
 *
 * Icons are restricted to ones already imported elsewhere (guaranteed valid);
 * omit `icon` rather than risk an unresolved import.
 */
import {
  IconFileText,
  IconAlertCircle,
  IconShield,
  IconClipboardCheck,
  IconTable,
  IconHeadset,
  IconReplace,
  IconClipboardList,
  IconTestPipe,
  IconSchool,
  IconShieldCheck,
  IconSettings,
  IconBell,
  IconForms,
  IconArrowsShuffle,
  IconTool,
} from '@tabler/icons-vue'

/** @type {Record<string, import('@shared/composables/routeMetaHelpers.js').RouteMetaEntry>} */
export const ROUTE_META = {
  // ── Quality records ──────────────────────────────────────────────
  '/documents': { title: 'Documents', icon: IconFileText, permission: 'document_control:read' },
  '/documents/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Document',
    icon: IconFileText,
    parent: '/documents',
  },
  '/nonconformances': {
    title: 'Nonconformances',
    icon: IconAlertCircle,
    permission: 'ncr:read',
  },
  '/nonconformances/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Nonconformance',
    icon: IconAlertCircle,
    parent: '/nonconformances',
  },
  '/capas': { title: 'CAPAs', icon: IconShield, permission: 'capa:read' },
  '/capas/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'CAPA',
    icon: IconShield,
    parent: '/capas',
  },
  '/customer-complaints': {
    title: 'Customer Complaints',
    icon: IconHeadset,
    permission: 'complaint_management:read',
  },
  '/customer-complaints/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Complaint',
    icon: IconHeadset,
    parent: '/customer-complaints',
  },
  '/change-requests': {
    title: 'Change Requests',
    icon: IconReplace,
    permission: 'change_control:read',
  },
  '/change-requests/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Change Request',
    icon: IconReplace,
    parent: '/change-requests',
  },
  '/audits': { title: 'Audits', icon: IconClipboardCheck, permission: 'audit_management:read' },
  '/records': { title: 'Records', icon: IconTable, permission: 'records:read' },

  // ── Operations ───────────────────────────────────────────────────
  '/equipment': { title: 'Equipment', icon: IconTool },
  '/inspections-logs': {
    title: 'Inspections & Logs',
    icon: IconClipboardList,
    permission: 'field_records:create',
  },
  '/qc-inspection': {
    title: 'QC Inspection',
    icon: IconTestPipe,
    permission: 'inspection_qc:read',
  },

  // ── Training ─────────────────────────────────────────────────────
  '/trainings': { title: 'Training Library', icon: IconSchool, permission: 'training:read' },
  '/trainings/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Training',
    icon: IconSchool,
    parent: '/trainings',
  },
  '/training-instances': {
    title: 'Training Instances',
    icon: IconSchool,
    permission: 'training_instances:read',
  },

  // ── Admin / settings ─────────────────────────────────────────────
  '/security': { title: 'Security', icon: IconShieldCheck },
  '/organization-security': {
    title: 'Organization Security',
    icon: IconShield,
    permission: 'security:manage',
    parent: '/settings',
  },
  '/admin-security': {
    title: 'Security Center',
    icon: IconShield,
    permission: 'security:manage',
    parent: '/settings',
  },
  '/vendor-access-log': {
    title: 'Vendor Access',
    icon: IconShield,
    permission: 'security:manage',
    parent: '/settings',
  },
  '/audit-logs': { title: 'Audit Logs', icon: IconShieldCheck },
  '/settings': { title: 'Settings', icon: IconSettings, permission: 'company_settings:manage' },
  '/notification-rules': {
    title: 'Notification Settings',
    icon: IconBell,
    permission: 'company_settings:manage',
    parent: '/settings',
  },
  '/templates': { title: 'Form Templates', icon: IconForms, permission: 'forms_templates:read' },
  '/workflow-templates': {
    title: 'Workflow Templates',
    icon: IconArrowsShuffle,
    permission: 'workflows_templates:read',
  },
  '/workflow-templates/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Workflow',
    icon: IconArrowsShuffle,
    parent: '/workflow-templates',
  },
}
