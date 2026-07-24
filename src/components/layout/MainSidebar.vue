<script setup>
import {
  IconForms,
  IconStack2,
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
  IconSettings,
  IconAdjustments,
  IconArticle,
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
  IconClipboardList,
  IconClipboardCheck,
  IconHeadset,
  IconTool,
  IconTestPipe,
  IconHelpCircle,
  IconBell,
  IconListDetails,
  IconEye,
  IconBolt,
  IconWorld,
  IconLicense,
  IconGavel,
  IconMessageReport,
  IconSeeding,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany'
import { isDark } from '@/utils/theme.js'
import {
  logoutCurrentSession,
  currentSession,
  isAllowed,
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

// Check if a route is active (including nested routes)
function isActive(targetPath) {
  if (!targetPath) return false
  const currentPath = route.path

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
// Suppliers don't hold `<key>:read`; RLS already scopes moduleTemplates to the
// modules they have a shared record of, so list the modules they can see with
// no permission gate.
const supplierModuleNavItems = computed(() =>
  (moduleTemplates.value || []).map((t) => ({
    label: t.moduleConfig?.displayName || t.title,
    icon: IconForms,
    to: getCompanyPath(`/m/${t.internalName}`),
  })),
)

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
      label: 'Change Requests',
      permissions: ['change_control:read'],
      icon: IconReplace,
      to: getCompanyPath('/change-requests'),
    },
    {
      label: 'Audits',
      icon: IconChecklist,
      // audits:read gates the list itself; auditors assigned to an
      // audit can still see it via the row-level RLS even without
      // this permission (handled at the RLS layer, see
      // audit_instances_select_rls).
      permissions: ['audit_management:read'],
      to: getCompanyPath('/audits'),
    },
    {
      label: 'Inspections & Logs',
      icon: IconClipboardList,
      // Single broadly-granted gate. The landing page itself shows /
      // hides individual cards based on finer-grained permissions
      // (inspections:assign for plans, fieldRecords:review for the
      // review queue, etc.).
      permissions: ['field_records:create'],
      to: getCompanyPath('/inspections-logs'),
    },
    {
      label: 'QC Inspection',
      icon: IconTestPipe,
      permissions: ['inspection_qc:read'],
      to: getCompanyPath('/qc-inspection'),
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
          icon: IconSchool,
          to: getCompanyPath('/task-instances?taskKindId=TRAINING'),
        },
        {
          label: 'Training Library',
          permissions: ['training:read'],
          icon: IconSchool,
          to: getCompanyPath('/trainings'),
        },
        {
          label: 'Training Instances',
          permissions: ['training_instances:read'],
          icon: IconSchool,
          to: getCompanyPath('/training-instances'),
        },
        {
          label: 'Training Verification',
          permissions: ['training_verifications:read'],
          icon: IconSchool,
          to: getCompanyPath('/training-verifications'),
        },
        {
          label: 'Training Curriculum',
          permissions: ['training:read'],
          icon: IconSchool,
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
          label: 'Workflow Templates',
          permissions: ['workflows_templates:read'],
          icon: IconArrowsShuffle,
          to: getCompanyPath('/workflow-templates'),
        },
        {
          // Reusable form fragments (kind='BLOCK') — first-class nav item with
          // its OWN authz module (form_blocks:*). Standalone Form Templates
          // moved into the App Builder workspace (Forms tab).
          label: 'Form Blocks',
          permissions: ['form_blocks:read'],
          icon: IconStack2,
          to: getCompanyPath('/form-blocks'),
        },
        {
          label: 'Document Templates',
          permissions: ['document_templates:read'],
          icon: IconArticle,
          to: getCompanyPath('/document-templates'),
        },
        {
          // Admin-defined custom fields per entity (NC / CAPA / CR / Audit /
          // Document / Training). Rendered as the "Additional information" card
          // on each detail page; stored in entity_field_values (JSONB), sealed.
          label: 'Custom Fields',
          permissions: ['custom_fields:manage'],
          icon: IconListDetails,
          to: getCompanyPath('/custom-fields'),
        },
        {
          label: 'RCA Templates',
          permissions: ['rca_templates:read'],
          icon: IconSitemap,
          to: getCompanyPath('/rca-templates'),
        },
        {
          label: 'Risk Assessment Templates',
          permissions: ['risk_assessment_templates:read'],
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
          // No `equipment:read` gate by design — RLS SELECT lets any
          // in-tenant user see the catalog, since log book authors need
          // to pick equipment without needing a separate permission.
          // Visibility is via the menu link being available to all.
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
          icon: IconList,
          to: getCompanyPath('/lookups'),
        },
      ],
    },
    {
      label: 'Settings',
      icon: IconSettings,
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
        {
          // Config-driven notification engine (entity create / status-change →
          // notify groups / people / owner / initiator over in-app + email).
          label: 'Notifications',
          permissions: ['company_settings:manage'],
          icon: IconBell,
          to: getCompanyPath('/notification-rules'),
        },
        {
          // Condition-based automation / notification rules (object → AND/OR
          // conditions → actions: notify, create NC, …). Scoped per site/dept.
          label: 'Automation Rules',
          permissions: ['automation_rules:manage'],
          icon: IconBolt,
          to: getCompanyPath('/automation-rules'),
        },
        // Complaint Settings moved onto the Customer Complaints page itself
        // (gear icon in the header) — module settings live with the module.
        {
          label: 'Sites',
          permissions: ['sites:read'],
          icon: IconBuilding,
          to: getCompanyPath('/sites'),
        },
        {
          label: 'Departments',
          permissions: ['departments:read'],
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
          icon: IconKey,
          to: getCompanyPath('/api-keys'),
        },
        {
          // AI sidecar — see backend/ai/README.md, AI_PLAN.md §6.5.
          // Always visible; backend 404s if AI_MODULE_ENABLED is off.
          label: 'API Tokens',
          icon: IconRobot,
          to: getCompanyPath('/api-tokens'),
        },
        {
          // AI usage dashboard. Visible to all users; admins/ai:audit see
          // company-wide data, regular users see only their own calls.
          label: 'AI Usage',
          icon: IconChartBar,
          to: getCompanyPath('/ai-usage'),
        },
        {
          // Company-wide activity ledger — reference surface, not day-to-day
          // (moved from the top level 2026-07-24, user decision).
          label: 'Audit Logs',
          icon: IconShieldCheck,
          to: getCompanyPath('/audit-logs'),
        },
      ].filter((item) => {
        // If no permissions specified, always show
        if (!item.permissions || item.permissions.length === 0) return true

        return isAllowed(item.permissions) && isNavItemEntitled(item)
      }),
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
          children: item.children.filter((child) => {
            if (!child.permissions || child.permissions.length === 0) return true
            return isAllowed(child.permissions) && isNavItemEntitled(child)
          }),
        }
      }
      return item
    })
    .filter((item) => {
      // Drop a group whose children were all permission-filtered away, so a user
      // with none of the child permissions never sees an empty expandable header.
      if (item.children && item.children.length === 0) return false
      // If no permissions specified, always show
      if (!item.permissions || item.permissions.length === 0) return true

      return isAllowed(item.permissions) && isNavItemEntitled(item)
    })
})
</script>

<template>
  <!-- display:contents wrapper — single template root for lint, but the aside
       still participates in the parent flex layout exactly as before. -->
  <div class="tw:contents">
    <!-- Backdrop — only on small screens when the overlay sidebar is open. -->
    <div
      v-if="visible && !isDesktop"
      class="tw:fixed tw:inset-0 tw:z-sticky tw:bg-black/40 tw:lg:hidden"
      @click="closeMobile"
    />
    <Transition name="mainSidebar">
      <aside
        v-if="visible"
        class="tw:w-64 tw:border-r tw:border-divider tw:bg-sidebar tw:flex! tw:flex-col tw:justify-between tw:h-screen tw:fixed tw:inset-y-0 tw:left-0 tw:z-overlay tw:lg:static tw:lg:z-auto"
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
            <div
              v-else
              class="tw:bg-primary tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:size-10 tw:text-white"
            >
              <IconChartBar :size="24" />
            </div>
            <div class="tw:flex tw:flex-col">
              <div class="tw:text-on-sidebar tw:text-base tw:font-bold tw:leading-tight">
                {{ isSupplier ? 'Supplier Portal' : 'QMS Admin' }}
              </div>
              <div class="tw:text-secondary tw:text-xs tw:font-medium">
                {{ isSupplier ? 'Documents & Tasks' : 'Quality Management' }}
              </div>
            </div>
          </RouterLink>

          <!-- Nav Links -->
          <nav class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:overflow-auto">
            <template v-for="item in navItems">
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
                    :class="isActive(child.to) ? 'tw:bg-main-selected tw:text-primary' : ''"
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
