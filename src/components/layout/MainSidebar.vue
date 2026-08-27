<script setup>
import {
  IconFileImport,
  IconCirclePlus,
  IconChevronLeft,
  IconMessageCircle,
  IconForms,
  IconTable,
  IconFileText,
  IconArrowsShuffle,
  IconInbox,
  IconCheckbox,
  IconTruck,
  IconPackage,
  IconTemplate,
  IconDatabase,
  IconShieldCheck,
  IconShare,
  IconSettings,
  IconAdjustments,
  IconBuilding,
  IconBuildingCommunity,
  IconUsers,
  IconShield,
  IconUsersGroup,
  IconKey,
  IconRobot,
  IconChartBar,
  IconUserCircle,
  IconLogout,
  IconChevronDown,
  IconChevronRight,
  IconAlertCircle,
  IconSitemap,
  IconLayoutGrid,
  IconList,
  IconSchool,
  IconReplace,
  IconChecklist,
  IconCalendar,
  IconBuildingBank,
  IconClipboardList,
  IconClipboardText,
  IconClipboardCheck,
  IconArchive,
  IconRuler,
  IconChartDots,
  IconGauge,
  IconFlask,
  IconSpray,
  IconUserCheck,
  IconBooks,
  IconCalendarEvent,
  IconCertificate,
  IconRoute,
  IconHeadset,
  IconTool,
  IconTestPipe,
  IconHelpCircle,
  IconBell,
  IconListDetails,
  IconEye,
  IconWorld,
  IconLicense,
  IconGavel,
  IconMessageReport,
  IconSeeding,
  IconBook,
  IconStack2,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany'
import { isDark } from '@/utils/theme.js'
import {
  logoutCurrentSession,
  currentSession,
  isAllowed,
  hasWriteOn,
  isModuleEntitled,
  isPlatformAdmin,
  isSupplier,
} from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useSidebar } from '@/composables/useSidebar'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

// Leaving a record context via the left nav starts a fresh record trail.
const { reset: resetTrail } = useRecordTrail()

const { visible, isDesktop, closeMobile } = useSidebar()
const route = useRoute()
const router = useRouter()

// Entitlement (commercial) gate for a nav item, in addition to its RBAC
// permission. A module nav item carries `permissions: ['<module_id>:read']`, so
// its module id is the prefix of the first permission. Hide the item when the
// tenant's plan doesn't include that module. Fail-open (isModuleEntitled) means
// unlimited tenants — every tenant today — see no change.
function isNavItemEntitled(item) {
  if (!item.permissions || item.permissions.length === 0) return true
  const moduleId = item.permissions[0].split(':')[0]
  return isModuleEntitled(moduleId)
}

// Single visibility predicate for every nav item — RBAC gate + commercial
// entitlement gate + optional write gate. `writeGate: '<moduleId>'` hides the
// item from read-only roles: template/admin modules are often granted `read`
// only so pickers and reference lookups work (e.g. Quality Engineer reads
// workflow templates for the CAPA/NC submit flow), and that grant is not an
// invitation to browse the authoring page. The item renders only when the role
// holds a write capability on the module. Declutter, not security — direct
// links stay reachable (permissionGuard.js keeps its `:read` gates).
function isNavItemVisible(item) {
  const gated = item.permissions && item.permissions.length > 0
  if (gated && !(isAllowed(item.permissions) && isNavItemEntitled(item))) return false
  // anyPermissions: show when ANY listed permission is held — for entries
  // fronting a multi-module workspace (tabbed pages) where holding any one
  // tab's module should surface the entry. `permissions` remains the
  // every-of/entitlement gate.
  if (item.anyPermissions && !item.anyPermissions.some((p) => isAllowed([p]))) return false
  if (item.writeGate && !hasWriteOn(item.writeGate)) return false
  // anyWriteGates: the write-gate equivalent of anyPermissions, for an entry
  // that fronts two modules (Templates = workflow templates + document
  // templates). A single `writeGate` would hide the entry from someone who
  // authors document templates but not workflows.
  if (item.anyWriteGates && !item.anyWriteGates.some((m) => hasWriteOn(m))) return false
  return true
}

// On a small screen the sidebar overlays the page; close it after the user
// navigates so it doesn't linger over the destination.
watch(
  () => route.fullPath,
  () => {
    if (!isDesktop.value) closeMobile()
  },
)

// Track expanded state for grouped nav items — persisted per company so a
// collapsed group stays collapsed across navigation and reloads.
const expandedGroups = useCompanyLocalStorage('sidebar-groups', {})

function toggleGroup(label) {
  // Reassign (not mutate-in-place) so the localStorage-backed ref persists.
  expandedGroups.value = {
    ...expandedGroups.value,
    [label]: !(expandedGroups.value[label] ?? true),
  }
}

function isGroupExpanded(label) {
  return expandedGroups.value[label] ?? true
}

// Check if a route is active (including nested routes). `extraPaths` covers an
// entry that fronts more than one path tree — the merged Templates list opens
// document templates at /document-templates/:id, which would otherwise leave
// the sidebar with nothing highlighted.
function isActive(targetPath, extraPaths) {
  if (!targetPath) return false
  const currentPath = route.path
  if (extraPaths?.some((p) => currentPath === p || currentPath.startsWith(p + '/'))) return true

  // Query-tab links (e.g. /qc-inspection?tab=specifications): active only when
  // BOTH the path and the tab match. A tab-less link to the same path is the
  // group's default tab — active only when no (or the default) tab is set.
  const qIdx = targetPath.indexOf('?')
  if (qIdx >= 0) {
    const [pathPart, queryPart] = [targetPath.slice(0, qIdx), targetPath.slice(qIdx + 1)]
    const targetTab = new URLSearchParams(queryPart).get('tab')
    return currentPath === pathPart && route.query.tab === targetTab
  }

  // Exact match
  if (currentPath === targetPath) return true

  // Nested route match (current path starts with target path)
  // Ensure we match complete path segments (not partial matches)
  const normalizedTarget = targetPath.endsWith('/') ? targetPath : targetPath + '/'
  return currentPath.startsWith(normalizedTarget)
}

// User info from current session
const currentUser = computed(() => {
  if (!currentSession.value) return null

  return {
    fullName:
      `${currentSession.value.firstName || ''} ${currentSession.value.lastName || ''}`.trim(),
    ...currentSession.value,
    jobTitle: currentSession.value.jobTitle || 'User',
  }
})

// The signed-in user's RBAC role assignments (for the account menu).
const myRoleAssignments = useLiveQueryWithDeps(
  [() => currentUser.value?.id],
  async (db, [userId]) => {
    if (!userId) return []
    return db.RoleOnUser.where('userId', userId).exec()
  },
  { models: ['RoleOnUser'], initial: [] },
)

// Prefer the dark-mode logo variant (uploaded in Company Settings →
// Branding) when the dark theme is active; fall back to the regular icon.
const logoUrl = computed(() => {
  if (isDark.value && currentCompany.value?.companyDarkIconUrl) {
    return currentCompany.value.companyDarkIconUrl
  }
  return currentCompany.value?.companyIconUrl
})

// Admin-defined modules (form templates promoted via the module factory) drive
// their own nav entries — the first data-driven part of the menu. Gated by the
// module's own `<internalName>:read` permission. Archived modules drop out of
// the nav (existing records stay reachable by id/deep link).
const moduleTemplates = useLiveQuery(
  async (db) =>
    (await db.FormTemplate.where().exec()).filter(
      (t) => t.isModule && t.internalName && t.statusId === 'ACTIVE',
    ),
  { initial: [], models: ['FormTemplate'] },
)
const moduleNavItems = computed(() =>
  (moduleTemplates.value || []).map((t) => ({
    label: t.moduleConfig?.displayName || t.title,
    permissions: [`${t.internalName}:read`],
    icon: IconForms,
    to: getCompanyPath(`/m/${t.internalName}`),
  })),
)
// Suppliers don't hold `<key>:read`, and form templates are tenant-public —
// every ACTIVE module template syncs to a supplier's IDB, so listing templates
// would light up every module for every supplier (leak, 2026-08-27). What RLS
// actually scopes for portal users is the RECORDS table (shared / task-assigned
// rows only), so the nav is driven by that: a module appears once the supplier
// can see at least one of its records.
const supplierVisibleRecords = useLiveQueryWithDeps(
  [() => isSupplier.value],
  async (db, [supplier]) => (supplier ? db.Record.where().exec() : []),
  { initial: [], models: ['Record'] },
)
const supplierModuleNavItems = computed(() => {
  const visibleModules = new Set((supplierVisibleRecords.value || []).map((r) => r.moduleKey))
  return (moduleTemplates.value || [])
    .filter((t) => visibleModules.has(t.internalName))
    .map((t) => ({
      label: t.moduleConfig?.displayName || t.title,
      icon: IconForms,
      to: getCompanyPath(`/m/${t.internalName}`),
    }))
})

// Navigation items
const navItems = computed(() => {
  // EXTERNAL_SUPPLIER users get a stripped-down menu — just the things
  // they can actually act on. No admin/settings/training/audit. The
  // dashboard at /[code]/supplier is their landing page.
  if (isSupplier.value) {
    return [
      {
        label: 'Dashboard',
        icon: IconChartBar,
        to: getCompanyPath('/supplier'),
      },
      {
        label: 'Document Requests',
        icon: IconInbox,
        to: getCompanyPath('/supplier/document-requests'),
      },
      {
        label: 'My Tasks',
        icon: IconCheckbox,
        to: getCompanyPath('/task-instances'),
      },
      // Admin-defined modules with a record shared to this supplier.
      ...supplierModuleNavItems.value,
      {
        label: 'Documents',
        icon: IconFileText,
        to: getCompanyPath('/documents'),
      },
      {
        label: 'Nonconformances',
        icon: IconAlertCircle,
        to: getCompanyPath('/nonconformances'),
      },
      {
        label: 'CAPAs',
        icon: IconShield,
        to: getCompanyPath('/capas'),
      },
      // Quality Events shared with this supplier (shared_with_user →
      // QualityEvent). The list is RLS-scoped to events shared with them;
      // no permission gate (suppliers don't carry qualityEvents:read).
      {
        label: 'Quality Events',
        icon: IconEye,
        to: getCompanyPath('/qualityEvents'),
      },
      // Audits surface visible when an internal team adds the
      // supplier user to an audit's team (audit_team_members) — RLS
      // lets the supplier through the membership branch even without
      // audits:read. The /audits route lands on the same module
      // landing as internal users; the Instances tab is the one with
      // useful content (Insights / Programs are gated by perms).
      {
        label: 'Audits',
        icon: IconClipboardCheck,
        to: getCompanyPath('/audits?tab=instances'),
      },
    ]
  }

  return [
    {
      label: 'My Tasks',
      icon: IconCheckbox,
      to: getCompanyPath('/task-instances'),
    },
    // Admin-defined modules (data-driven).
    ...moduleNavItems.value,
    {
      label: 'Document Control',
      permissions: ['document_control:read'],
      icon: IconFileText,
      to: getCompanyPath('/documents'),
    },
    {
      // Migration aid, used heavily during onboarding and rarely after. Gated
      // on CREATE rather than read so it stays out of the nav for everyone who
      // only consumes documents — a bulk importer is not something most users
      // should be invited to discover.
      label: 'Bulk Import',
      permissions: ['document_control:create'],
      icon: IconFileImport,
      to: getCompanyPath('/document-imports'),
    },
    {
      label: 'Nonconformances',
      permissions: ['ncr:read'],
      icon: IconAlertCircle,
      to: getCompanyPath('/nonconformances'),
    },
    {
      label: 'Quality Events',
      permissions: ['quality_events:read'],
      icon: IconEye,
      to: getCompanyPath('/qualityEvents'),
    },
    {
      // Standalone QMS quality complaints (the `complaints` table) with the
      // QA-review workflow — an independent module from the support Customer
      // Complaints entry (below, next to App Builder — it's the support-desk
      // surface, not a core QMS record).
      label: 'Complaints',
      permissions: ['complaints:read'],
      icon: IconMessageReport,
      to: getCompanyPath('/complaints'),
    },
    {
      label: 'CAPAs',
      permissions: ['capa:read'],
      icon: IconShield,
      to: getCompanyPath('/capas'),
    },
    {
      // UI says "Change Control" (module name, user decision 2026-08-13);
      // routes/DB stay change-requests / ChangeRequest, records stay "CR".
      label: 'Change Control',
      permissions: ['change_control:read'],
      icon: IconReplace,
      to: getCompanyPath('/change-requests'),
    },
    {
      // Submenu like QC Inspection / Inspections & Logs (user request
      // 2026-08-15): the page's ?tab= sections become nav children so an
      // auditor can reach Standards or the Audit Plan without first landing
      // on Insights and hunting for a tab.
      //
      // audits:read gates the group; auditors assigned to an audit can still
      // see it via row-level RLS even without this permission (see
      // audit_instances_select_rls).
      label: 'Audits',
      icon: IconChecklist,
      permissions: ['audit_management:read'],
      // Two roles, two surfaces (2026-08-24): the AUDITOR runs internal /
      // supplier audits (tabbed working page); the AUDITEE tracks
      // certification audits done TO the company. Standards + Readiness are
      // shared references alongside.
      children: [
        {
          label: 'Auditor',
          permissions: ['audit_management:read'],
          icon: IconChecklist,
          to: getCompanyPath('/audits?tab=insights'),
        },
        {
          label: 'Auditee',
          permissions: ['audit_management:read'],
          icon: IconBuildingBank,
          to: getCompanyPath('/auditee'),
        },
        {
          // Shared view: internal + supplier + certification audits on one
          // grid — belongs to neither role, so it sits beside them.
          label: 'Calendar',
          permissions: ['audit_management:read'],
          icon: IconCalendar,
          to: getCompanyPath('/audits?tab=calendar'),
        },
        {
          label: 'Standards',
          permissions: ['audit_management:read'],
          icon: IconBook,
          to: getCompanyPath('/audits?tab=standards'),
        },
        {
          label: 'Audit Readiness',
          permissions: ['audit_management:read'],
          icon: IconShieldCheck,
          to: getCompanyPath('/audits?tab=readiness'),
        },
      ],
    },
    {
      // Submenu like QC Inspection (user request 2026-08-05): ?tab= children,
      // each gated on its tab's module; the group header auto-hides when every
      // child is filtered away, which subsumes the old anyPermissions gate.
      label: 'Inspections & Logs',
      icon: IconClipboardList,
      children: [
        {
          label: 'Logs',
          permissions: ['field_records:read'],
          icon: IconClipboardText,
          to: getCompanyPath('/inspections-logs?tab=logs'),
        },
        {
          label: 'Log Books',
          permissions: ['log_books:read'],
          icon: IconBook,
          to: getCompanyPath('/inspections-logs?tab=log-books'),
        },
        // HIDDEN with Form Blocks (user request 2026-08-15) — Log Forms is the
        // same form-block surface, filtered to blockCategory LOG_FORM. The
        // page and the "start a log book from a log form" picker still work.
        // {
        //   label: 'Log Forms',
        //   permissions: ['form_blocks:read'],
        //   writeGate: 'form_blocks',
        //   icon: IconForms,
        //   to: getCompanyPath('/inspections-logs/log-forms'),
        // },
        {
          label: 'Assignments',
          permissions: ['inspections:read'],
          icon: IconChecklist,
          to: getCompanyPath('/inspections-logs?tab=assignments'),
        },
      ],
    },
    {
      // Submenu mirrors the /qc-inspection sections (formerly on-page tabs —
      // user decision 2026-07-27: navigate them like the Training group).
      // Same permission gates the tabs used; children hide per grant.
      label: 'QC Inspection',
      icon: IconTestPipe,
      children: [
        {
          label: 'Inspections',
          permissions: ['inspection_qc:read'],
          icon: IconClipboardCheck,
          to: getCompanyPath('/qc-inspection?tab=lots'),
        },
        {
          label: 'Retain Samples',
          permissions: ['retain_samples:read'],
          icon: IconArchive,
          to: getCompanyPath('/qc-inspection?tab=retain-samples'),
        },
        {
          label: 'Inspection Plans',
          permissions: ['inspection_templates:read'],
          icon: IconClipboardList,
          to: getCompanyPath('/qc-inspection?tab=inspection-plans'),
        },
        {
          label: 'Specifications',
          permissions: ['inspection_spec:read'],
          icon: IconRuler,
          to: getCompanyPath('/qc-inspection?tab=specifications'),
        },
        {
          label: 'Sampling Plans',
          permissions: ['inspection_plan:read'],
          icon: IconChartDots,
          to: getCompanyPath('/qc-inspection?tab=sampling-plans'),
        },
        {
          label: 'AQL Standards',
          permissions: ['inspection_standards:read'],
          icon: IconGauge,
          to: getCompanyPath('/qc-inspection?tab=aql-standards'),
        },
        {
          label: 'Test Library',
          permissions: ['inspection_catalog:read'],
          icon: IconFlask,
          to: getCompanyPath('/qc-inspection?tab=test-library'),
        },
        {
          label: 'Line Clearance',
          permissions: ['inspection_settings:read'],
          icon: IconSpray,
          to: getCompanyPath('/qc-inspection?tab=line-clearance'),
        },
      ],
    },
    // The phone-first /logging portal left the desktop menu (user decision
    // 2026-07-24) — it's shared from Inspections & Logs → "Mobile Portal"
    // (QR + link for floor/warehouse phones) until the native app wraps it.
    {
      label: 'Training',
      icon: IconSchool,
      children: [
        {
          label: 'My Trainings',
          icon: IconUserCheck,
          to: getCompanyPath('/task-instances?taskKindId=TRAINING'),
        },
        {
          label: 'Training Library',
          permissions: ['training:read'],
          icon: IconBooks,
          to: getCompanyPath('/trainings'),
        },
        {
          label: 'Training Instances',
          permissions: ['training_instances:read'],
          icon: IconCalendarEvent,
          to: getCompanyPath('/training-instances'),
        },
        {
          label: 'Training Verification',
          permissions: ['training_verifications:read'],
          icon: IconCertificate,
          to: getCompanyPath('/training-verifications'),
        },
        {
          // Curricula are reference data (tenant-public read) — this page is
          // the AUTHORING surface, so it follows the write-gate rule.
          label: 'Training Curriculum',
          permissions: ['training:read'],
          writeGate: 'training',
          icon: IconRoute,
          to: getCompanyPath('/training-curriculum'),
        },
      ],
    },
    {
      // Formerly "Records" — the generic form-template records surface,
      // being evolved into a Jotform-style dynamic form/record builder that
      // promotes templates to full on-the-fly modules (which then appear as
      // their own nav entries above). Not a core QMS record type, so it sits
      // below the day-to-day modules.
      label: 'App Builder',
      permissions: ['records:read'],
      icon: IconTable,
      to: getCompanyPath('/records'),
    },
    {
      // Support-desk complaint tickets (web/forms/email intake). Its module
      // settings live on the page itself (gear icon), not in Settings.
      label: 'Customer Complaints',
      permissions: ['complaint_management:read'],
      icon: IconHeadset,
      to: getCompanyPath('/customer-complaints'),
    },
    {}, // Divider
    {
      // Template-authoring surfaces — mirrors the "Templates" section of the
      // Roles & Permissions matrix (user decision 2026-07-24: nav groups and
      // matrix sections map 1:1 for easy navigation).
      label: 'Templates',
      icon: IconTemplate,
      children: [
        {
          // ONE merged list (user decision 2026-08-15): workflow templates for
          // the record modules (NC / CAPA / Change Control / promoted modules)
          // plus document templates, since both are "things an admin authors
          // up front". Rows dispatch to the right editor — a document template
          // still opens the Document Template editor. Approval-only flows are
          // deliberately excluded; they're the sibling entry below.
          label: 'Templates',
          anyPermissions: ['workflows_templates:read', 'document_templates:read'],
          anyWriteGates: ['workflows_templates', 'document_templates'],
          icon: IconTemplate,
          to: getCompanyPath('/workflow-templates'),
          matchPaths: [getCompanyPath('/document-templates')],
        },
        {
          // Sign-off flows for Log Book / Audit / QC / Document Control —
          // approval steps only, no task forms, so they don't belong in the
          // authoring list above.
          label: 'Approval Flows',
          permissions: ['workflows_templates:read'],
          writeGate: 'workflows_templates',
          icon: IconArrowsShuffle,
          to: getCompanyPath('/approval-flows'),
        },
        {
          // Restored 2026-08-16. Hidden the day before as a concept users
          // hadn't asked for, but it is the one place a form block can be
          // edited on its own — which is how you change an embedded fragment
          // everywhere it appears, and how you inspect what the mini form
          // designer produced. It stays write-gated, so a read-only role
          // never sees it; narrow it further with the form_blocks permission
          // if it turns out to confuse authors again.
          label: 'Form Blocks',
          permissions: ['form_blocks:read'],
          writeGate: 'form_blocks',
          icon: IconStack2,
          to: getCompanyPath('/form-blocks'),
        },
        // MERGED into "Templates" above (user decision 2026-08-15) — the
        // (re-add the IconArticle import when restoring this entry)
        // /document-templates page still exists and rows there still open the
        // Document Template editor; only the separate nav entry is gone.
        // {
        //   label: 'Document Templates',
        //   permissions: ['document_templates:read'],
        //   writeGate: 'document_templates',
        //   icon: IconArticle,
        //   to: getCompanyPath('/document-templates'),
        // },
        {
          // The notification engine, under the name people look for
          // (2026-08-18). Two entries used to compete: a "Notifications" page
          // backed by notification_rules — one static recipient list per entity
          // type, no trigger, no conditions, empty in every tenant — and
          // "Automation Rules", which is the one that works: object → trigger
          // (created / status-changed / updated / scheduled) → AND/OR
          // conditions → actions, scoped per site and department. The dead one
          // is gone; the working one took its name and moved here.
          //
          // Named for both halves: it notifies (group / user / owner /
          // requester / email) AND acts (CREATE_NC, CREATE_TASK). "Notifications"
          // alone would hide the second half from anyone looking for it;
          // "Automation Rules" alone hid the first, which is why nobody found
          // it. Whether the action half survives is still open — SEND_SMS is a
          // stub until Twilio is configured.
          label: 'Notifications & Automation',
          permissions: ['automation_rules:manage'],
          icon: IconBell,
          to: getCompanyPath('/automation-rules'),
        },
        {
          // Admin-defined custom fields per entity (NC / CAPA / CR / Audit /
          // Document / Training). Rendered as the "Additional information" card
          // on each detail page; stored in entity_field_values (JSONB), sealed.
          label: 'Custom Fields',
          permissions: ['custom_fields:manage'],
          writeGate: 'custom_fields',
          icon: IconListDetails,
          to: getCompanyPath('/custom-fields'),
        },
        {
          label: 'RCA Templates',
          permissions: ['rca_templates:read'],
          writeGate: 'rca_templates',
          icon: IconSitemap,
          to: getCompanyPath('/rca-templates'),
        },
        {
          label: 'Risk Assessment Templates',
          permissions: ['risk_assessment_templates:read'],
          writeGate: 'risk_assessment_templates',
          icon: IconLayoutGrid,
          to: getCompanyPath('/risk-assessment-templates'),
        },
      ],
    },
    {
      // Company masters + lookup vocabularies — mirrors the "Master Data"
      // section of the Roles & Permissions matrix.
      label: 'Master Data',
      icon: IconDatabase,
      children: [
        {
          label: 'Suppliers',
          permissions: ['supplier_management:read'],
          icon: IconTruck,
          to: getCompanyPath('/suppliers'),
        },
        {
          label: 'Equipment',
          // Reference data: RLS SELECT is tenant-public (public_read binding)
          // so log book authors can pick equipment without any grant. The nav
          // entry follows the Master Data write-gate rule — it shows only for
          // roles that can AUTHOR the catalog; everyone else keeps the data in
          // pickers and the page by direct link. (Predates writeGate: was
          // "visible to all" because that was the only option then.)
          writeGate: 'calibration_equipment',
          icon: IconTool,
          to: getCompanyPath('/equipment'),
        },
        {
          // Industry-aligned label: "Item Master" for the admin
          // catalog page. Covers raw materials, components, WIP, and
          // finished goods — matches ERP terminology. Underlying DB
          // table stays `products` (UI-only relabel decision
          // 2026-05-26); operational selectors use "Item".
          label: 'Item Master',
          permissions: ['products:read'],
          writeGate: 'products',
          icon: IconPackage,
          to: getCompanyPath('/products'),
        },
        // Option Sets moved under Form Templates → Option Sets tab.
        // Lookups (NC dispositions/issue types, supplier certificate
        // types, audit standard types/finding categories) live on the
        // standalone /lookups page; /settings?tab=lookups redirects
        // there for old bookmarks.
        {
          label: 'Lookups',
          permissions: ['company_settings:manage'],
          writeGate: 'company_settings',
          icon: IconList,
          to: getCompanyPath('/lookups'),
        },
      ],
    },
    {
      label: 'Settings',
      icon: IconSettings,
      // Drills IN rather than expanding: two dozen settings pages unrolled
      // inside the main nav buries everything below them (user request
      // 2026-08-17). See settingsOpen.
      drillIn: true,
      children: [
        {
          label: 'General',
          permissions: ['company_settings:manage'],
          icon: IconAdjustments,
          to: getCompanyPath('/settings'),
        },
        {
          // Tenant auth policy: login methods, allowed domains, MFA + session
          // policy. Login-method toggles are enforced; the rest is stored.
          label: 'Organization Security',
          permissions: ['security:manage'],
          icon: IconShield,
          to: getCompanyPath('/organization-security'),
        },
        {
          // Admin actions on users' security state + the tenant event feed.
          label: 'Security Center',
          permissions: ['security:manage'],
          icon: IconShieldCheck,
          to: getCompanyPath('/admin-security'),
        },
        // Vendor Access (platform-operator transparency ledger at
        // /vendor-access-log) was removed from the menu 2026-07-24 (user
        // decision) — page + API remain reachable by direct URL for
        // security:manage holders.
        // Complaint Settings moved onto the Customer Complaints page itself
        // (gear icon in the header) — module settings live with the module.
        {
          // Org reference data: every user reads their ASSIGNED sites with no
          // grant (baseline scoped read, migration 20260805100000) — a read
          // grant only widens picker reach and must not surface this admin
          // page. Nav follows the Master Data write-gate rule.
          label: 'Sites',
          permissions: ['sites:read'],
          writeGate: 'sites',
          icon: IconBuilding,
          to: getCompanyPath('/sites'),
        },
        {
          // Same rule — departments follow the user's site visibility in
          // pickers; this entry is for administering the org structure.
          label: 'Departments',
          permissions: ['departments:read'],
          writeGate: 'departments',
          icon: IconBuildingCommunity,
          to: getCompanyPath('/departments'),
        },
        {
          label: 'Users',
          permissions: ['user_management:read'],
          icon: IconUsers,
          to: getCompanyPath('/users'),
        },
        {
          label: 'Roles',
          permissions: ['role_permission_management:read'],
          icon: IconShield,
          to: getCompanyPath('/roles'),
        },
        {
          label: 'Groups',
          permissions: ['teams:read'],
          icon: IconUsersGroup,
          to: getCompanyPath('/groups'),
        },
        {
          label: 'API Keys',
          permissions: ['api_integrations:read'],
          icon: IconKey,
          to: getCompanyPath('/api-keys'),
        },
        {
          // AI sidecar PATs — see backend/ai/README.md, AI_PLAN.md §6.5.
          // ai:read is implied by ANY ai grant (run/manage/audit), so this
          // shows for anyone with an AI capability; backend still 404s when
          // AI_MODULE_ENABLED is off.
          label: 'API Tokens',
          permissions: ['ai:read'],
          icon: IconRobot,
          to: getCompanyPath('/api-tokens'),
        },
        {
          // AI usage dashboard. ai:audit sees company-wide data, other AI
          // grant holders see their own calls; no AI grant → no entry.
          label: 'AI Usage',
          permissions: ['ai:read'],
          icon: IconChartBar,
          to: getCompanyPath('/ai-usage'),
        },
        {
          // Company-wide activity ledger — reference surface, not day-to-day
          // (moved from the top level 2026-07-24, user decision). Gated on the
          // dedicated audit_trail module (read/export in the matrix).
          label: 'Audit Logs',
          permissions: ['audit_trail:read'],
          icon: IconShieldCheck,
          to: getCompanyPath('/audit-logs'),
        },
        {
          // Every external share link in one place: who outside the company can
          // read a record, whether they ever opened it, and withdrawal.
          //
          // `anyPermissions` (ANY, not ALL) because sharing is granted per
          // module — somebody who may share NCs but nothing else still needs
          // the page. The ROWS are filtered by RLS, which inherits each
          // record's own visibility, so the entry gate can stay this simple
          // without showing anyone a record they could not already open.
          label: 'Shared Records',
          anyPermissions: [
            'ncr:manage_access',
            'capa:manage_access',
            'change_control:manage_access',
            'complaints:manage_access',
            'inspection_qc:manage_access',
            'quality_events:manage_access',
          ],
          icon: IconShare,
          to: getCompanyPath('/shared-records'),
        },
        {
          // Qualification protocols customers execute to validate the system in
          // a regulated environment. Moved here from the profile menu
          // (2026-08-17, user decision): validation is an administrative and
          // compliance activity, not a personal-account one, so a QA lead looks
          // for it under Settings rather than under their own avatar.
          // Ungated, like Help — reference material every user may read. But
          // `requiresSibling` keeps it from being the only reason Settings
          // appears: a user with no settings permissions still reaches it from
          // the Help Center, without gaining a one-item Settings menu.
          label: 'Validation Package',
          icon: IconCertificate,
          requiresSibling: true,
          to: getCompanyPath('/validation'),
        },
      ].filter(isNavItemVisible),
    },
    // Platform Console — cross-tenant control plane. Gated on the platform-admin
    // standing from the session (not company permissions); every /platform/*
    // route is re-checked server-side by requirePlatformAdmin. Impersonation
    // lives here (not under a tenant "Admin" menu) because it is a cross-tenant
    // control-plane capability. Non-/platform paths (impersonate) stay as-is.
    ...(isPlatformAdmin.value
      ? [
          {}, // Divider
          {
            label: 'Platform',
            icon: IconWorld,
            children: [
              { label: 'Overview', icon: IconLayoutGrid, to: '/platform' },
              { label: 'Tenants', icon: IconBuildingCommunity, to: '/platform/companies' },
              { label: 'Seed Defaults', icon: IconSeeding, to: '/platform/seed' },
              { label: 'Plans', icon: IconLicense, to: '/platform/plans' },
              {
                label: 'Impersonate',
                icon: IconUserCircle,
                to: getCompanyPath('/admin/impersonate'),
              },
              { label: 'Approvals', icon: IconGavel, to: '/platform/approvals' },
              { label: 'Operators', icon: IconShield, to: '/platform/admins' },
              { label: 'Audit', icon: IconListDetails, to: '/platform/audit' },
              // Internal Docs Center — engineering doc corpus (qms/docs/modules),
              // operator-only like the rest of this group (guard: /docs segment).
              { label: 'Internal Docs', icon: IconBook, to: getCompanyPath('/docs') },
            ],
          },
        ]
      : []),
  ]
    .map((item) => {
      // Permission-filter a group's children so a link the user can't reach never
      // renders under an expandable header (e.g. Training Library / Instances /
      // Verification / Curriculum without their `:read` permission). Children with
      // no `permissions` (My Trainings, dividers) always pass. This centralizes
      // what some groups previously hand-rolled inline, so a new group can never
      // forget to gate its children.
      if (item.children && item.children.length) {
        return {
          ...item,
          children: item.children.filter(isNavItemVisible),
        }
      }
      return item
    })
    .filter((item) => {
      // Drop a group whose children were all permission-filtered away, so a user
      // with none of the child permissions never sees an empty expandable header.
      //
      // `requiresSibling` children don't count towards "not empty". Every other
      // Settings child is permission-gated, so a single UNGATED entry would
      // otherwise summon the whole Settings group for a shop-floor user who can
      // reach nothing else inside it. Such an entry still renders whenever the
      // group is shown for some other reason — it just can't conjure it alone.
      if (item.children && !item.children.some((c) => !c.requiresSibling)) return false
      return isNavItemVisible(item)
    })
})

// ─── Settings drill-in ───────────────────────────────────────────────────────
/**
 * Settings replaces the nav instead of unrolling inside it.
 *
 * Two dozen entries expanded in place pushes every other module off-screen, so
 * the group swaps the rail for its own list with a Main Menu link back — the
 * pattern a phone settings app uses, for the same reason.
 */
const settingsOpen = ref(false)

const settingsGroup = computed(() => navItems.value.find((i) => i.drillIn))
const settingsChildren = computed(() => settingsGroup.value?.children ?? [])

/**
 * The rail follows the page: arriving at a settings page opens it, going
 * anywhere else closes it. So a deep link lands with the right context, and
 * using Create from inside settings does not leave you on a Documents page
 * staring at a settings rail.
 *
 * Keyed on the path CHANGING, deliberately. Recomputing continuously would
 * make Back useless — it would re-open the instant it closed, since closing
 * the rail does not navigate away from the settings page you are on.
 */
watch(
  () => route.path,
  (path) => {
    settingsOpen.value = settingsChildren.value.some((c) => c.to && path.startsWith(c.to))
  },
  { immediate: true },
)

// Everything except Settings — it is rendered on its own, pinned at the end.
const mainNavItems = computed(() => navItems.value.filter((i) => !i.drillIn))

// ─── Quick create ────────────────────────────────────────────────────────────
// Collapsed by default: the six entries would otherwise push the whole nav
// down on every page load for a menu most visits do not use.
const createOpen = ref(false)

function runQuickCreate(item) {
  createOpen.value = false
  closeMobile()
  item.click()
}

/**
 * The records people raise day to day, one click from anywhere.
 *
 * Deliberately NOT every module: this sits at the top of the nav, and a list of
 * twenty makes the common four harder to reach, not easier. Admin objects
 * (templates, sites, users) are set up once and belong on their own pages.
 *
 * Each entry is gated on CREATE, so the menu offers only what this user can
 * actually raise — offering "New CAPA" to someone who will be refused at the
 * form is worse than not offering it.
 *
 * Empty for supplier users, whose portal is documents and tasks assigned to
 * them; they raise nothing themselves.
 */
const quickCreateItems = computed(() => {
  if (isSupplier.value) return []
  const go = (path) => () => router.push(getCompanyPath(path))
  return [
    {
      name: 'Document',
      permission: 'document_control:create',
      icon: IconFileText,
      click: go('/documents/create'),
    },
    {
      name: 'Nonconformance',
      permission: 'ncr:create',
      icon: IconAlertCircle,
      click: go('/nonconformances/create'),
    },
    { name: 'CAPA', permission: 'capa:create', icon: IconShield, click: go('/capas/create') },
    {
      name: 'Change Request',
      permission: 'change_control:create',
      icon: IconArrowsShuffle,
      click: go('/change-requests/create'),
    },
    {
      name: 'Quality Event',
      permission: 'quality_events:create',
      icon: IconEye,
      // No create ROUTE — the list page owns the dialog, so ?create=1 opens it.
      click: go('/qualityEvents?create=1'),
    },
    {
      name: 'Complaint',
      permission: 'complaints:create',
      icon: IconMessageCircle,
      click: go('/complaints/create'),
    },
  ].filter((i) => isAllowed([i.permission]))
})
</script>

<template>
  <!-- display:contents wrapper — single template root for lint, but the aside
       still participates in the parent flex layout exactly as before. -->
  <div class="tw:contents">
    <!-- Backdrop — only on small screens when the overlay sidebar is open. -->
    <div
      v-if="visible && !isDesktop"
      class="tw:fixed tw:inset-0 tw:z-sticky tw:bg-black/40 tw:xl:hidden"
      @click="closeMobile"
    />
    <Transition name="mainSidebar">
      <aside
        v-if="visible"
        class="tw:w-64 tw:border-r tw:border-divider tw:bg-sidebar tw:flex! tw:flex-col tw:justify-between tw:h-screen tw:fixed tw:inset-y-0 tw:left-0 tw:z-overlay tw:xl:static tw:xl:z-auto"
      >
        <div class="tw:flex tw:flex-col tw:gap-4 tw:p-4 tw:flex-1 tw:overflow-hidden">
          <!-- Brand — links home (dashboard) -->
          <RouterLink
            :to="getCompanyPath('/dashboard')"
            class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:-m-1 tw:p-1 tw:hover:bg-main-hover tw:transition-colors"
            @click="resetTrail"
          >
            <div v-if="logoUrl">
              <img :src="logoUrl" alt="Company Logo" class="tw:w-10 tw:h-10 tw:rounded" />
            </div>
            <!-- No customer logo uploaded yet: show the Qability mark rather
                 than a generic chart glyph. `tone="auto"` because the sidebar
                 follows the app theme, unlike the auth pages' always-dark
                 branding panel. -->
            <BrandLogo v-else variant="mark" class="tw:size-10" />
            <div class="tw:flex tw:flex-col">
              <div class="tw:text-on-sidebar tw:text-base tw:font-bold tw:leading-tight">
                {{ isSupplier ? 'Supplier Portal' : 'QMS Admin' }}
              </div>
              <div class="tw:text-secondary tw:text-xs tw:font-medium">
                {{ isSupplier ? 'Documents & Tasks' : 'Quality Management' }}
              </div>
            </div>
          </RouterLink>

          <!-- Quick create. Sits above the nav because raising a record is the
               most frequent thing anyone does here, and it otherwise means
               finding the module first, then its Create button. Renders
               nothing when the user can create nothing, rather than a menu
               that opens empty. -->
          <div v-if="quickCreateItems.length" class="tw:flex tw:flex-col tw:gap-1">
            <!-- Expands in place rather than in a popover: BasePopover is
                 w-fit, so a full-width trigger cannot span the rail, and the
                 sidebar already expands its groups inline — this reads as part
                 of the same furniture. -->
            <button
              type="button"
              class="tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border-0 tw:bg-primary tw:px-3 tw:py-2 tw:text-sm tw:font-semibold tw:text-white tw:transition-colors tw:hover:bg-primary/90 tw:cursor-pointer"
              :aria-expanded="createOpen"
              @click="createOpen = !createOpen"
            >
              <IconCirclePlus :size="18" />
              Create
              <component :is="createOpen ? IconChevronDown : IconChevronRight" :size="14" />
            </button>

            <div v-if="createOpen" class="tw:flex tw:flex-col tw:gap-0.5 tw:pl-1">
              <button
                v-for="item in quickCreateItems"
                :key="item.name"
                type="button"
                class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-3 tw:py-1.5 tw:text-left tw:text-sm tw:text-secondary tw:transition-colors tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar tw:cursor-pointer tw:[font:inherit]"
                @click="runQuickCreate(item)"
              >
                <component :is="item.icon" :size="18" />
                <span>{{ item.name }}</span>
              </button>
            </div>
          </div>

          <!-- ══ Settings rail ══ Replaces the nav entirely; Back returns. -->
          <nav v-if="settingsOpen" class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:overflow-auto">
            <button
              type="button"
              class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:font-semibold tw:text-on-sidebar tw:transition-colors tw:hover:bg-sidebar-hover tw:cursor-pointer tw:[font:inherit]"
              @click="settingsOpen = false"
            >
              <IconChevronLeft :size="18" />
              <!-- "Main Menu", not "Back": Back reads as browser-back, and this
                   does not navigate — it swaps the rail. -->
              <span class="tw:flex-1">Main Menu</span>
            </button>

            <div class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:pt-1 tw:pb-2">
              <IconSettings :size="20" class="tw:text-primary" />
              <span class="tw:text-base tw:font-bold tw:text-on-sidebar">Settings</span>
            </div>

            <RouterLink
              v-for="child in settingsChildren"
              :key="child.label"
              :to="child.to"
              class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:py-2 tw:text-secondary tw:hover:bg-sidebar-hover tw:transition-colors tw:no-underline"
              :class="
                isActive(child.to, child.matchPaths) ? 'tw:bg-main-selected tw:text-primary' : ''
              "
              @click="resetTrail"
            >
              <component :is="child.icon" :size="20" />
              <span class="tw:text-sm tw:font-medium">{{ child.label }}</span>
            </RouterLink>
          </nav>

          <!-- Nav Links -->
          <nav v-else class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:overflow-auto">
            <template v-for="item in mainNavItems">
              <!-- Parent item with children -->
              <template v-if="item.children">
                <button
                  :key="`${item.label}-btn`"
                  class="tw:flex tw:items-center tw:gap-3 tw:w-full tw:px-3 tw:py-2 tw:rounded-lg tw:text-secondary tw:hover:bg-sidebar-hover tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer tw:appearance-none tw:[font:inherit]"
                  @click="toggleGroup(item.label)"
                >
                  <!-- Same icon size as single items so group headers (Training,
                       Templates, Master Data, Settings) match their siblings. -->
                  <component :is="item.icon" :size="24" />
                  <span class="tw:text-sm tw:font-medium tw:flex-1 tw:text-left">{{
                    item.label
                  }}</span>
                  <component
                    :is="isGroupExpanded(item.label) ? IconChevronDown : IconChevronRight"
                    :size="16"
                  />
                </button>
                <div
                  v-if="isGroupExpanded(item.label)"
                  :key="`${item.label}-children`"
                  class="tw:ml-3 tw:flex tw:flex-col tw:gap-0.5"
                >
                  <RouterLink
                    v-for="child in item.children"
                    :key="child.label"
                    :to="child.to"
                    class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:py-2 tw:text-secondary tw:hover:bg-sidebar-hover tw:transition-colors tw:no-underline"
                    :class="
                      isActive(child.to, child.matchPaths)
                        ? 'tw:bg-main-selected tw:text-primary'
                        : ''
                    "
                    @click="resetTrail"
                  >
                    <component :is="child.icon" :size="20" />
                    <span class="tw:text-sm tw:font-medium">{{ child.label }}</span>
                  </RouterLink>
                </div>
              </template>

              <!-- Single item without children -->
              <RouterLink
                v-else-if="item.to"
                :key="item.label"
                :to="item.to"
                class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:py-2 tw:text-secondary tw:hover:bg-sidebar-hover tw:transition-colors tw:no-underline"
                :class="isActive(item.to) ? 'tw:bg-main-selected tw:text-primary!' : ''"
                @click="resetTrail"
              >
                <component :is="item.icon" :size="24" />
                <span class="tw:text-sm tw:font-medium">{{ item.label }}</span>
              </RouterLink>

              <!-- Divider -->
              <hr v-else :key="item.label" class="tw:border-t tw:border-divider tw:my-2" />
            </template>

            <!-- Settings — opens its own rail rather than unrolling here.
                 Pinned last: it is the least-visited group and the one that
                 would otherwise dominate the list. -->
            <template v-if="settingsGroup">
              <hr class="tw:border-t tw:border-divider tw:my-2" />
              <button
                type="button"
                class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-secondary tw:transition-colors tw:hover:bg-sidebar-hover tw:cursor-pointer tw:appearance-none tw:[font:inherit]"
                @click="settingsOpen = true"
              >
                <IconSettings :size="24" />
                <span class="tw:flex-1 tw:text-sm tw:font-medium">Settings</span>
                <IconChevronRight :size="16" />
              </button>
            </template>
          </nav>
        </div>

        <!-- Profile / Account menu -->
        <div class="tw:px-3 tw:py-2 tw:border-t tw:border-divider">
          <BasePopover v-if="currentUser" placement="top-start" :arrow="false">
            <template #button>
              <button
                class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:p-1.5 tw:hover:bg-sidebar-hover tw:transition-colors"
              >
                <UserAvatar :user="currentUser" class="tw:size-8" />
                <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-start">
                  <div
                    class="tw:max-w-full tw:truncate tw:text-sm tw:font-semibold tw:text-on-sidebar"
                  >
                    {{ currentUser.fullName }}
                  </div>
                  <div class="tw:max-w-full tw:truncate tw:text-xs tw:text-secondary">
                    {{ currentUser.jobTitle }}
                  </div>
                </div>
                <IconChevronDown :size="16" class="tw:shrink-0 tw:text-secondary" />
              </button>
            </template>

            <template #content="{ close }">
              <div class="tw:w-64 tw:py-1">
                <div class="tw:px-3 tw:py-2">
                  <div class="tw:flex tw:items-center tw:gap-2">
                    <span class="tw:truncate tw:text-sm tw:font-semibold tw:text-on-sidebar">
                      {{ currentUser.fullName }}
                    </span>
                    <BaseBadge v-if="currentUser.isOwner" class="tw:bg-primary/10 tw:text-primary">
                      Owner
                    </BaseBadge>
                  </div>
                  <div class="tw:truncate tw:text-xs tw:text-secondary" :title="currentUser.email">
                    {{ currentUser.email }}
                  </div>
                  <div
                    v-if="currentUser.jobTitle && currentUser.jobTitle !== 'User'"
                    class="tw:truncate tw:text-caption tw:text-secondary"
                  >
                    {{ currentUser.jobTitle }}
                  </div>
                  <div
                    v-if="myRoleAssignments.length"
                    class="tw:mt-1.5 tw:flex tw:flex-wrap tw:gap-1"
                  >
                    <RoleBadgeById
                      v-for="ra in myRoleAssignments"
                      :key="ra.id"
                      :roleId="ra.roleId"
                    />
                  </div>
                </div>

                <hr class="tw:my-1 tw:border-divider" />

                <RouterLink
                  :to="getCompanyPath('/profile')"
                  class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
                  @click="close()"
                >
                  <IconUserCircle :size="16" class="tw:text-secondary" />
                  My Profile
                </RouterLink>

                <RouterLink
                  :to="getCompanyPath('/settings')"
                  class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
                  @click="close()"
                >
                  <IconSettings :size="16" class="tw:text-secondary" />
                  Settings
                </RouterLink>

                <RouterLink
                  :to="getCompanyPath('/profile?tab=security')"
                  class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
                  @click="close()"
                >
                  <IconShieldCheck :size="16" class="tw:text-secondary" />
                  Security
                </RouterLink>

                <RouterLink
                  :to="getCompanyPath('/help')"
                  class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
                  @click="close()"
                >
                  <IconHelpCircle :size="16" class="tw:text-secondary" />
                  Help Center
                </RouterLink>

                <div
                  class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar"
                >
                  <span class="tw:flex tw:items-center tw:gap-2">
                    <IconUserCircle :size="16" class="tw:text-secondary" />
                    Appearance
                  </span>
                  <ThemeToggle :size="18" />
                </div>

                <hr class="tw:my-1 tw:border-divider" />

                <button
                  class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-bad tw:transition-colors tw:hover:bg-main-hover"
                  @click="logoutCurrentSession"
                >
                  <IconLogout :size="16" />
                  Log out
                </button>
              </div>
            </template>
          </BasePopover>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.mainSidebar-enter-active,
.mainSidebar-leave-active {
  transition: width 0.3s ease;
  overflow: hidden;
}

.mainSidebar-leave-to {
  width: 0;
}
</style>
