<script setup>
/**
 * Quick actions — real navigation shortcuts to the most common QA flows.
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

// Neutral cards with a colored icon chip — full-color button backgrounds
// made the labels unreadable against the theme palette.
const actions = [
  { label: 'Report Nonconformance', icon: IconAlertTriangle, to: '/nonconformances', chip: 'tw:bg-warn/10 tw:text-warn' },
  { label: 'New CAPA', icon: IconTargetArrow, to: '/capas/create', chip: 'tw:bg-primary/10 tw:text-primary' },
  { label: 'My Tasks', icon: IconChecklist, to: '/task-instances', chip: 'tw:bg-blue-100 tw:text-blue-600' },
  { label: 'Documents', icon: IconFolderOpen, to: '/documents', chip: 'tw:bg-good/10 tw:text-good' },
  { label: 'QC Inspection', icon: IconTestPipe, to: '/qc-inspection', chip: 'tw:bg-violet-100 tw:text-violet-600' },
  { label: 'Audits', icon: IconClipboardCheck, to: '/audits/instances', chip: 'tw:bg-gray-100 tw:text-gray-600' },
]
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
        <span class="tw:text-xs tw:font-semibold tw:text-on-main tw:leading-tight">{{ a.label }}</span>
      </RouterLink>
    </div>
  </DashboardWidgetCard>
</template>
