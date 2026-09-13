<script setup>
/**
 * Quick actions — real navigation shortcuts to the most common QA flows.
 *
 * Per-tile gated on the destination module's own `:read` (or `:create` for
 * the CAPA-create shortcut, since /capas/create is a write route) — the same
 * permission the sidebar/route guard and DashboardKpis' cards require, so a
 * viewer never sees a tile that dead-ends at /no-access. `null` = always
 * shown (My Tasks is the user's own work, same as the KPI strip). See
 * docs/modules/dashboard's 2026-09-07 addendum, finding 3.
 */
import {
  IconAlertTriangle,
  IconTargetArrow,
  IconFolderOpen,
  IconChecklist,
  IconTestPipe,
  IconClipboardCheck,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession'

// Neutral cards with a colored icon chip — full-color button backgrounds
// made the labels unreadable against the theme palette.
const ALL_ACTIONS = [
  {
    label: 'Report Nonconformance',
    icon: IconAlertTriangle,
    to: '/nonconformances',
    chip: 'tw:bg-warn/10 tw:text-warn',
    permission: 'ncr:read',
  },
  {
    label: 'New CAPA',
    icon: IconTargetArrow,
    to: '/capas/create',
    chip: 'tw:bg-primary/10 tw:text-primary',
    permission: 'capa:create',
  },
  {
    label: 'My Tasks',
    icon: IconChecklist,
    to: '/task-instances',
    chip: 'tw:bg-blue-100 tw:text-blue-600',
    permission: null,
  },
  {
    label: 'Documents',
    icon: IconFolderOpen,
    to: '/documents',
    chip: 'tw:bg-good/10 tw:text-good',
    permission: 'document_control:read',
  },
  {
    label: 'QC Inspection',
    icon: IconTestPipe,
    to: '/qc-inspection',
    chip: 'tw:bg-violet-100 tw:text-violet-600',
    permission: 'inspection_qc:read',
  },
  {
    label: 'Audits',
    icon: IconClipboardCheck,
    to: '/audits/instances',
    chip: 'tw:bg-gray-100 tw:text-gray-600',
    permission: 'audit_management:read',
  },
]

const actions = computed(() =>
  ALL_ACTIONS.filter((a) => !a.permission || isAllowed([a.permission])),
)
</script>

<template>
  <DashboardWidgetCard title="Quick Actions" tone="violet">
    <div class="tw:grid tw:grid-cols-2 tw:gap-2 tw:p-3">
      <RouterLink
        v-for="a in actions"
        :key="a.label"
        :to="getCompanyPath(a.to)"
        class="tw:flex tw:items-center tw:gap-2.5 tw:px-3 tw:py-2.5 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary/40 tw:transition-colors"
      >
        <span
          class="tw:size-8 tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:shrink-0"
          :class="a.chip"
        >
          <component :is="a.icon" :size="16" />
        </span>
        <span class="tw:text-xs tw:font-semibold tw:text-on-main tw:leading-tight">{{
          a.label
        }}</span>
      </RouterLink>
    </div>
  </DashboardWidgetCard>
</template>
