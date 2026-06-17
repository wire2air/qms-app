<script setup>
/**
 * QA dashboard — live widgets over IDB (no fake data). Users pick which
 * widgets show via the Customize dialog AND drag panels to reorder them; both
 * the selection and the order are persisted on users.settings.dashboardWidgets
 * (§39, an ordered array of enabled ids), so it follows the user across devices.
 */
import { IconAdjustmentsHorizontal, IconLayoutDashboard } from '@tabler/icons-vue'
import { useSortable, moveArrayElement } from '@vueuse/integrations/useSortable'
import { currentSession } from '@/utils/currentSession'
import { useUserSettings } from '@/composables/useUserSettings'
import DashboardMyTasks from './DashboardMyTasks.vue'
import DashboardOpenNcs from './DashboardOpenNcs.vue'
import DashboardCapasDue from './DashboardCapasDue.vue'
import DashboardQuickActions from './DashboardQuickActions.vue'
import DashboardQcLots from './DashboardQcLots.vue'
import DashboardDocsPending from './DashboardDocsPending.vue'
import DashboardRecentAudits from './DashboardRecentAudits.vue'

const companyName = computed(() => currentSession.value?.name || currentSession.value?.code || '')

// ── Widget registry ───────────────────────────────────────────────────────
// Order here = the default order. kpis is a full-width summary strip pinned
// above the draggable grid; the rest reorder freely.
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
// id → component for the reorderable grid (kpis excluded — rendered separately).
const GRID_COMPONENTS = {
  'my-tasks': DashboardMyTasks,
  'open-ncs': DashboardOpenNcs,
  'capas-due': DashboardCapasDue,
  'quick-actions': DashboardQuickActions,
  'qc-lots': DashboardQcLots,
  'docs-pending': DashboardDocsPending,
  audits: DashboardRecentAudits,
}
const GRID_IDS = Object.keys(GRID_COMPONENTS)

const { getSetting, setSetting } = useUserSettings()

const enabledIds = computed(() => {
  const ids = getSetting('dashboardWidgets', null)
  if (!Array.isArray(ids)) return ALL_IDS
  return ids.filter((id) => ALL_IDS.includes(id))
})
const kpisOn = computed(() => enabledIds.value.includes('kpis'))

// Local, reorderable copy of the enabled grid widgets (in saved order). The
// watch only reacts to MEMBERSHIP changes (a widget toggled in the Customize
// dialog) — an order-only change to the setting (our own drag persist) is
// ignored, otherwise it would echo back and revert the drop.
const gridOrder = ref([])
watch(
  enabledIds,
  (ids) => {
    const enabled = ids.filter((id) => GRID_IDS.includes(id))
    const sameSet =
      enabled.length === gridOrder.value.length &&
      enabled.every((id) => gridOrder.value.includes(id))
    if (sameSet) return
    // Preserve the current drag order; append newly-enabled, drop disabled.
    const kept = gridOrder.value.filter((id) => enabled.includes(id))
    gridOrder.value = [...kept, ...enabled.filter((id) => !kept.includes(id))]
  },
  { immediate: true },
)

// Drag-to-reorder via the header grip (.drag-handle). moveArrayElement resets
// the DOM and updates gridOrder on the NEXT tick, so we compute the resulting
// order synchronously here and persist that (persisting gridOrder directly
// would save the stale, pre-move order).
const gridRef = ref(null)
useSortable(gridRef, gridOrder, {
  handle: '.drag-handle',
  animation: 150,
  ghostClass: 'dashboard-ghost',
  onUpdate(e) {
    moveArrayElement(gridOrder, e.oldIndex, e.newIndex, e)
    const next = [...gridOrder.value]
    const [moved] = next.splice(e.oldIndex, 1)
    next.splice(e.newIndex, 0, moved)
    persistOrder(next)
  },
})

async function persistOrder(order = gridOrder.value) {
  await setSetting('dashboardWidgets', [...(kpisOn.value ? ['kpis'] : []), ...order])
}

const showCustomize = ref(false)
async function saveEnabled(ids) {
  await setSetting('dashboardWidgets', ids)
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconLayoutDashboard" title="Dashboard">
      <template #subtitle>
        Welcome back! Here's what's happening with {{ companyName }} today.
      </template>
      <template #actions>
        <BaseButton variant="outline" size="sm" @click="showCustomize = true">
          <template #icon><IconAdjustmentsHorizontal :size="16" /></template>
          Customize
        </BaseButton>
      </template>
    </PageHeader>

    <!-- KPI row (full width) -->
    <DashboardKpis v-if="kpisOn" />

    <!-- Reorderable widget grid (drag a panel by its header grip) -->
    <div
      ref="gridRef"
      class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:xl:grid-cols-3 tw:gap-4 tw:items-start"
    >
      <component :is="GRID_COMPONENTS[id]" v-for="id in gridOrder" :key="id" />
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
  </BasePage>
</template>

<style scoped>
:deep(.dashboard-ghost) {
  opacity: 0.4;
}
</style>
