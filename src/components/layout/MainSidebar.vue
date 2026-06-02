<script setup>
import {
  IconForms,
  IconTable,
  IconFileText,
  IconArrowsShuffle,
  IconInbox,
  IconCheckbox,
  IconTruck,
  IconPackage,
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
  IconShieldHalf,
  IconChartBar,
  IconUserCircle,
  IconLogout,
  IconChevronDown,
  IconChevronRight,
  IconAlertCircle,
  IconSitemap,
  IconLayoutGrid,
  IconSchool,
  IconReplace,
  IconChecklist,
  IconClipboardList,
  IconClipboardCheck,
  IconTool,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany'
import {
  logoutCurrentSession,
  currentSession,
  isAllowed,
  isAdmin,
  isSupplier,
} from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'

const drawer = useCompanyLocalStorage('sidebar-drawer', true)
const route = useRoute()

// Track expanded state for grouped nav items
const expandedGroups = ref({})

function toggleGroup(label) {
  expandedGroups.value[label] = !(expandedGroups.value[label] ?? true)
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

const logoUrl = computed(() => {
  return currentCompany.value?.companyIconUrl
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
    ]
  }

  return [
    {
      label: 'Records',
      permissions: ['records:read'],
      icon: IconTable,
      to: getCompanyPath('/records'),
    },
    {
      label: 'Documents',
      permissions: ['documents:read'],
      icon: IconFileText,
      to: getCompanyPath('/documents'),
    },
    {
      label: 'My Tasks',
      icon: IconCheckbox,
      to: getCompanyPath('/task-instances'),
    },
    {
      label: 'Nonconformances',
      permissions: ['nonconformances:read'],
      icon: IconAlertCircle,
      to: getCompanyPath('/nonconformances'),
    },
    {
      label: 'CAPAs',
      permissions: ['capas:read'],
      icon: IconShield,
      to: getCompanyPath('/capas'),
    },
    {
      label: 'Change Requests',
      permissions: ['changeRequests:read'],
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
      permissions: ['audits:read'],
      to: getCompanyPath('/audits'),
    },
    {
      label: 'Inspections & Logs',
      icon: IconClipboardList,
      // Single broadly-granted gate. The landing page itself shows /
      // hides individual cards based on finer-grained permissions
      // (inspections:assign for plans, fieldRecords:review for the
      // review queue, etc.).
      permissions: ['fieldRecords:create'],
      to: getCompanyPath('/inspections-logs'),
    },
    {
      // Floor-user logging entry — mobile-first dashboard (pick a log
      // book → fill) + My Tasks. The route wrapped in the iOS/Android
      // WebView later. Distinct from the admin "Inspections & Logs".
      label: 'Logging',
      icon: IconClipboardCheck,
      permissions: ['fieldRecords:create'],
      to: getCompanyPath('/logging'),
    },
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
          permissions: ['trainings:read'],
          icon: IconSchool,
          to: getCompanyPath('/trainings'),
        },
        {
          label: 'Training Instances',
          permissions: ['trainingInstances:read'],
          icon: IconSchool,
          to: getCompanyPath('/training-instances'),
        },
        {
          label: 'Training Verification',
          permissions: ['trainingVerifications:read'],
          icon: IconSchool,
          to: getCompanyPath('/training-verifications'),
        },
        {
          label: 'Training Matrix',
          permissions: ['trainingMatrix:read'],
          icon: IconSchool,
          to: getCompanyPath('/training-matrix'),
        },
      ],
    },
    {}, // Divider
    {
      label: 'Audit Logs',
      icon: IconShieldCheck,
      to: getCompanyPath('/audit-logs'),
    },
    {
      label: 'Settings',
      icon: IconSettings,
      children: [
        {
          label: 'General',
          permissions: ['company:manage'],
          icon: IconAdjustments,
          to: getCompanyPath('/settings'),
        },
        {
          label: 'Form Templates',
          permissions: ['formTemplates:read'],
          icon: IconForms,
          to: getCompanyPath('/templates'),
        },
        {
          label: 'Workflow Templates',
          permissions: ['workflows:read'],
          icon: IconArrowsShuffle,
          to: getCompanyPath('/workflow-templates'),
        },
        {
          label: 'Workflow Instances',
          permissions: ['documents:read'],
          icon: IconInbox,
          to: getCompanyPath('/workflow-instances'),
        },
        {
          label: 'Document Templates',
          permissions: ['document-templates:read'],
          icon: IconArticle,
          to: getCompanyPath('/document-templates'),
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
          label: 'Suppliers',
          permissions: ['suppliers:read'],
          icon: IconTruck,
          to: getCompanyPath('/suppliers'),
        },
        {
          label: 'RCA Templates',
          permissions: ['rcaTemplates:read'],
          icon: IconSitemap,
          to: getCompanyPath('/rca-templates'),
        },
        {
          label: 'Risk Assessment Templates',
          permissions: ['riskAssessmentTemplates:read'],
          icon: IconLayoutGrid,
          to: getCompanyPath('/risk-assessment-templates'),
        },
        // Option Sets moved under Form Templates → Option Sets tab.
        // NC Dispositions remain at Settings → Lookups (the canonical
        // home); previously had a redundant shortcut here.
        // The standalone /option-sets and /settings?tab=lookups routes
        // both still exist for back-compat with bookmarks.
        {
          label: 'Sites',
          icon: IconBuilding,
          to: getCompanyPath('/sites'),
        },
        {
          label: 'Departments',
          icon: IconBuildingCommunity,
          to: getCompanyPath('/departments'),
        },
        {
          label: 'Users',
          permissions: ['users:read'],
          icon: IconUsers,
          to: getCompanyPath('/users'),
        },
        {
          label: 'Roles',
          permissions: ['roles:read'],
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
      ].filter((item) => {
        // If no permissions specified, always show
        if (!item.permissions || item.permissions.length === 0) return true

        return isAllowed(item.permissions)
      }),
    },
    ...(isAdmin.value
      ? [
          {}, // Divider
          {
            label: 'Admin',
            icon: IconShieldHalf,
            children: [
              {
                label: 'Impersonate',
                icon: IconUserCircle,
                to: getCompanyPath('/admin/impersonate'),
              },
            ],
          },
        ]
      : []),
  ].filter((item) => {
    // If no permissions specified, always show
    if (!item.permissions || item.permissions.length === 0) return true

    return isAllowed(item.permissions)
  })
})
</script>

<template>
  <Transition name="mainSidebar">
    <aside
      v-if="drawer"
      class="tw:w-64 tw:border-r tw:border-divider tw:bg-sidebar tw:flex! tw:flex-col tw:justify-between tw:h-screen"
    >
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-4 tw:flex-1 tw:overflow-hidden">
        <!-- Brand -->
        <div class="tw:flex tw:items-center tw:gap-3">
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
        </div>

        <!-- Nav Links -->
        <nav class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:overflow-auto">
          <template v-for="item in navItems">
            <!-- Parent item with children -->
            <template v-if="item.children">
              <button
                :key="`${item.label}-btn`"
                class="tw:flex tw:items-center tw:gap-3 tw:w-full tw:px-3 tw:py-2 tw:rounded-lg tw:text-secondary tw:hover:bg-sidebar-hover tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="toggleGroup(item.label)"
              >
                <component :is="item.icon" :size="20" />
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
            >
              <component :is="item.icon" :size="24" />
              <span class="tw:text-sm tw:font-medium">{{ item.label }}</span>
            </RouterLink>

            <!-- Divider -->
            <hr v-else :key="item.label" class="tw:border-t tw:border-divider tw:my-2" />
          </template>
        </nav>
      </div>

      <!-- Profile / Bottom -->
      <div class="tw:px-4 tw:py-2 tw:border-t tw:border-divider">
        <div v-if="currentUser" class="tw:flex tw:items-center tw:gap-3">
          <UserAvatar :user="currentUser" class="tw:size-8" />
          <div class="tw:flex tw:flex-col tw:flex-1">
            <div class="tw:text-sm tw:font-bold tw:text-on-sidebar">{{ currentUser.fullName }}</div>
            <div class="tw:text-xs tw:text-secondary">{{ currentUser.jobTitle }}</div>
          </div>
          <button
            class="tw:p-1.5 tw:rounded-full tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="logoutCurrentSession"
          >
            <IconLogout :size="18" />
          </button>
        </div>
      </div>
    </aside>
  </Transition>
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
