<script setup>
/**
 * Open nonconformances — newest first, severity badge per row.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { IconCircleCheck } from '@tabler/icons-vue'

const ncs = useLiveQuery(
  async (db) => {
    const rows = await db.Nonconformance.where().exec()
    return rows
      .filter((n) => n.statusId !== 'CLOSED')
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)
</script>

<template>
  <DashboardWidgetCard title="Open Nonconformances" :count="ncs.length" linkTo="/nonconformances">
    <BaseEmptyState v-if="!ncs.length" dense :icon="IconCircleCheck" title="No open nonconformances" />
    <RouterLink
      v-for="nc in ncs.slice(0, 5)"
      :key="nc.id"
      :to="getCompanyPath(`/nonconformances/${nc.id}`)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">{{ nc.title }}</div>
        <div class="tw:text-xs tw:text-secondary tw:font-mono">{{ nc.ncNumber }}</div>
      </div>
      <NcSeverityBadgeById v-if="nc.severityId" :severityId="nc.severityId" />
    </RouterLink>
  </DashboardWidgetCard>
</template>
