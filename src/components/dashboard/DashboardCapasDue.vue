<script setup>
/**
 * Open CAPAs by due date — overdue rows highlighted.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { IconCircleCheck } from '@tabler/icons-vue'

const capas = useLiveQuery(
  async (db) => {
    const rows = await db.Capa.where().exec()
    return rows
      .filter((c) => !['CLOSED', 'CANCELLED'].includes(c.statusId))
      .sort((a, b) => {
        const da = a.dueDate?.toMillis?.() ?? Infinity
        const dbb = b.dueDate?.toMillis?.() ?? Infinity
        return da - dbb
      })
  },

  { models: ['Capa'], initial: [] },
)

function isOverdue(c) {
  return c.dueDate && c.dueDate < DateTime.now()
}
</script>

<template>
  <DashboardWidgetCard title="CAPAs Due" :count="capas.length" linkTo="/capas">
    <BaseEmptyState v-if="!capas.length" dense :icon="IconCircleCheck" title="No open CAPAs" />
    <RouterLink
      v-for="c in capas.slice(0, 5)"
      :key="c.id"
      :to="getCompanyPath(`/capas/${c.id}`)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">{{ c.title }}</div>
        <div class="tw:text-xs tw:text-secondary tw:font-mono">{{ c.capaNumber }}</div>
      </div>
      <span
        v-if="c.dueDate"
        class="tw:text-xs tw:font-medium tw:whitespace-nowrap"
        :class="isOverdue(c) ? 'tw:text-bad tw:font-bold' : 'tw:text-secondary'"
      >
        {{ isOverdue(c) ? 'Overdue · ' : '' }}{{ c.dueDate.formatDate('date') }}
      </span>
    </RouterLink>
  </DashboardWidgetCard>
</template>
