<script setup>
/**
 * Audits — in-flight first (not CLOSED), most recently touched on top.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const audits = useLiveQuery(
  async (db) => {
    const rows = await db.AuditInstance.where().exec()
    return rows
      .filter((a) => a.statusId !== 'CLOSED')
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)
</script>

<template>
  <DashboardWidgetCard title="Audits" :count="audits.length" linkTo="/audits/instances">
    <div v-if="!audits.length" class="tw:px-4 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
      No audits in progress.
    </div>
    <RouterLink
      v-for="a in audits.slice(0, 5)"
      :key="a.id"
      :to="getCompanyPath(`/audits/instances/${a.id}`)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:font-mono tw:truncate">{{ a.auditNumber || 'Audit' }}</div>
        <div v-if="a.scheduledDate" class="tw:text-xs tw:text-secondary">
          Scheduled {{ a.scheduledDate.formatDate('date') }}
        </div>
      </div>
      <AuditInstanceStatusBadgeById :statusId="a.statusId" />
    </RouterLink>
  </DashboardWidgetCard>
</template>
