<script setup>
/**
 * KPI stat row — live counts from IDB. Each card links to its module page.
 */
import { IconAlertCircle, IconTargetArrow, IconChecklist, IconTestPipe } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const openNcs = useLiveQuery(
  async (db) => {
    const rows = await db.Nonconformance.where().exec()
    return rows.filter((n) => n.statusId !== 'CLOSED')
  },

  { models: ['Nonconformance'], initial: [] },
)

const openCapas = useLiveQuery(
  async (db) => {
    const rows = await db.Capa.where().exec()
    return rows.filter((c) => !['CLOSED', 'CANCELLED'].includes(c.statusId))
  },

  { models: ['Capa'], initial: [] },
)

const myTasks = useLiveQueryWithDeps(
  [() => currentSession.value?.userId],
  async (db, [userId]) => {
    if (!userId) return []
    const rows = await db.TaskInstance.where('assignedTo', userId).exec()
    return rows.filter((t) => ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId))
  },

  { models: ['TaskInstance'], initial: [] },
)

const lotsAwaiting = useLiveQuery(
  async (db) => {
    const rows = await db.InspectionLot.where().exec()
    return rows.filter((l) => ['COMPLETED', 'UNDER_REVIEW'].includes(l.statusId))
  },

  { models: ['InspectionLot'], initial: [] },
)

function overdueCount(rows, dateField = 'dueDate') {
  const now = DateTime.now()
  return rows.filter((r) => r[dateField] && r[dateField] < now).length
}

const cards = computed(() => [
  {
    title: 'Open NCs',
    value: openNcs.value.length,
    sub: overdueCount(openNcs.value) ? `${overdueCount(openNcs.value)} overdue` : null,
    icon: IconAlertCircle,
    colorClass: 'tw:bg-warn/10 tw:text-warn',
    to: '/nonconformances',
  },
  {
    title: 'Open CAPAs',
    value: openCapas.value.length,
    sub: overdueCount(openCapas.value) ? `${overdueCount(openCapas.value)} overdue` : null,
    icon: IconTargetArrow,
    colorClass: 'tw:bg-primary/10 tw:text-primary',
    to: '/capas',
  },
  {
    title: 'My Open Tasks',
    value: myTasks.value.length,
    sub: overdueCount(myTasks.value) ? `${overdueCount(myTasks.value)} overdue` : null,
    icon: IconChecklist,
    colorClass: 'tw:bg-blue-100 tw:text-blue-600',
    to: '/task-instances',
  },
  {
    title: 'QC Lots Awaiting Disposition',
    value: lotsAwaiting.value.length,
    sub: null,
    icon: IconTestPipe,
    colorClass: 'tw:bg-violet-100 tw:text-violet-600',
    to: '/qc-inspection',
  },
])
</script>

<template>
  <ContentGrid min="14rem">
    <RouterLink
      v-for="card in cards"
      :key="card.title"
      :to="getCompanyPath(card.to)"
      class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-4 tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md"
    >
      <div class="tw:flex tw:items-start tw:justify-between tw:mb-3">
        <div
          class="tw:size-11 tw:rounded-xl tw:flex tw:items-center tw:justify-center"
          :class="card.colorClass"
        >
          <component :is="card.icon" :size="22" />
        </div>
        <span
          v-if="card.sub"
          class="tw:text-[11px] tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-bad/10 tw:text-bad"
        >
          {{ card.sub }}
        </span>
      </div>
      <div class="tw:text-3xl tw:font-bold tw:text-on-main">{{ card.value }}</div>
      <div class="tw:text-sm tw:text-secondary">{{ card.title }}</div>
    </RouterLink>
  </ContentGrid>
</template>
