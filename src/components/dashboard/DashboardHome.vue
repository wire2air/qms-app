<script setup>
/**
 * QA dashboard — live widgets over IDB (no fake data). Users pick which
 * widgets show via the Customize dialog; the selection is persisted on
 * users.settings.dashboardWidgets (§39), so it follows the user across
 * devices like any other synced field.
 */
import { IconAdjustmentsHorizontal } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession'
import { useUserSettings } from '@/composables/useUserSettings'

const companyName = computed(() => currentSession.value?.name || currentSession.value?.code || '')

// ── Widget registry ───────────────────────────────────────────────────────
// Order here = render order. All on by default.
const WIDGETS = [
  { id: 'kpis', label: 'KPI Summary', full: true },
  { id: 'my-tasks', label: 'My Tasks' },
  { id: 'open-ncs', label: 'Open Nonconformances' },
  { id: 'capas-due', label: 'CAPAs Due' },
  { id: 'quick-actions', label: 'Quick Actions' },
  { id: 'qc-lots', label: 'QC Inspection Lots' },
  { id: 'docs-pending', label: 'Documents Pending Approval' },
  { id: 'audits', label: 'Audits' },
]
const ALL_IDS = WIDGETS.map((w) => w.id)

const { getSetting, setSetting } = useUserSettings()

const enabledIds = computed(() => {
  const ids = getSetting('dashboardWidgets', null)
  if (!Array.isArray(ids)) return ALL_IDS
  return ids.filter((id) => ALL_IDS.includes(id))
})

const showCustomize = ref(false)
async function saveEnabled(ids) {
  await setSetting('dashboardWidgets', ids)
}

function on(id) {
  return enabledIds.value.includes(id)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:min-h-screen tw:bg-main tw:p-5 tw:gap-5">
    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
      <div>
        <div class="tw:text-3xl tw:font-bold tw:text-on-main">Dashboard</div>
        <div class="tw:text-base tw:text-secondary">
          Welcome back! Here's what's happening with {{ companyName }} today.
        </div>
      </div>
      <BaseButton variant="outline" size="sm" @click="showCustomize = true">
        <template #icon><IconAdjustmentsHorizontal :size="16" /></template>
        Customize
      </BaseButton>
    </div>

    <!-- KPI row (full width) -->
    <DashboardKpis v-if="on('kpis')" />

    <!-- Widget grid -->
    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:xl:grid-cols-3 tw:gap-4 tw:items-start">
      <DashboardMyTasks v-if="on('my-tasks')" />
      <DashboardOpenNcs v-if="on('open-ncs')" />
      <DashboardCapasDue v-if="on('capas-due')" />
      <DashboardQuickActions v-if="on('quick-actions')" />
      <DashboardQcLots v-if="on('qc-lots')" />
      <DashboardDocsPending v-if="on('docs-pending')" />
      <DashboardRecentAudits v-if="on('audits')" />
    </div>

    <div
      v-if="!enabledIds.length"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-20 tw:text-secondary tw:gap-2"
    >
      <div class="tw:text-sm">Your dashboard is empty.</div>
      <BaseButton variant="outline" size="sm" @click="showCustomize = true">Add widgets</BaseButton>
    </div>

    <DashboardCustomizeDialog
      v-model="showCustomize"
      :widgets="WIDGETS"
      :enabledIds="enabledIds"
      @save="saveEnabled"
    />
  </div>
</template>
