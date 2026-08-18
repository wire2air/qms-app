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
  IconBellRinging,
  IconForms,
  IconArrowsShuffle,
  IconTemplate,
  IconTool,
  IconChartBar,
  IconCompass,
  IconLayoutDashboard,
  IconFileAnalytics,
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
    title: 'Change Control',
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

  // ── Analytics ────────────────────────────────────────────────────
  '/analytics': {
    title: 'Analytics',
    icon: IconChartBar,
    permission: 'reports_dashboards:read',
  },
  // The whole subtree carries the same gate. Editing a dashboard needs more
  // than `read`, but that is enforced by RLS on the row — a route guard cannot
  // know whether THIS dashboard is yours, and pretending otherwise would mean
  // duplicating the ownership rule in the client where it could drift.
  '/analytics/dashboards': {
    title: 'Dashboards',
    icon: IconLayoutDashboard,
    permission: 'reports_dashboards:read',
  },
  '/analytics/reports': {
    title: 'Reports',
    icon: IconFileAnalytics,
    permission: 'reports_dashboards:read',
  },
  // The report page carries `?tab=schedules`, which makes a delivery schedule
  // linkable — and a linkable page needs a title and a way back. Same `read`
  // gate as the rest of the subtree: whether THIS report is yours, and whether
  // you may make a schedule LIVE (that needs `:export`), are row-level questions
  // a route guard cannot answer. RLS does, on the row.
  '/analytics/reports/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Report',
    icon: IconFileAnalytics,
    parent: '/analytics/reports',
    permission: 'reports_dashboards:read',
  },
  '/analytics/explore': {
    title: 'Data Explorer',
    icon: IconCompass,
    permission: 'reports_dashboards:read',
  },
  // Same gate as the rest of the subtree. Deliberately `read` and not `manage`,
  // even though naming SOMEBODY ELSE as a recipient needs `manage`: that seam
  // is inside the row (both write policies end `OR recipients <@ ARRAY[me]`),
  // so anybody may author an alert that mails only them. A route guard cannot
  // know which alert is which, and restating the rule here would only give the
  // client and `analytics_alerts_insert_rls` somewhere to disagree.
  '/analytics/alerts': {
    title: 'Alerts',
    icon: IconBellRinging,
    permission: 'reports_dashboards:read',
  },
  '/analytics/alerts/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Alert',
    icon: IconBellRinging,
    parent: '/analytics/alerts',
  },

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
    title: 'Training Matrix',
    icon: IconSchool,
    permission: 'training_instances:read',
  },
  '/training-curriculum': {
    title: 'Training Curriculum',
    icon: IconSchool,
    permission: 'training:read',
  },
  '/training-reports': {
    title: 'Matrix Report',
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
  // Serves the merged Templates list (workflow templates for record modules +
  // document templates). The path stayed /workflow-templates so existing deep
  // links and the :id editor below keep working.
  '/workflow-templates': {
    title: 'Templates',
    icon: IconTemplate,
    permission: 'workflows_templates:read',
  },
  '/workflow-templates/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Workflow',
    icon: IconArrowsShuffle,
    parent: '/workflow-templates',
  },
  '/approval-flows': {
    title: 'Approval Flows',
    icon: IconArrowsShuffle,
    permission: 'workflows_templates:read',
  },
  // Same editor as /workflow-templates/:id, mounted here so the sidebar keeps
  // Approval Flows highlighted while you're inside one.
  '/approval-flows/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'Approval Flow',
    icon: IconArrowsShuffle,
    parent: '/approval-flows',
  },
}
