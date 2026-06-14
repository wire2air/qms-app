<script setup>
/**
 * QC lots needing attention — COMPLETED (awaiting submit) and UNDER_REVIEW
 * (awaiting QA disposition).
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const lots = useLiveQuery(
  async (db) => {
    const rows = await db.InspectionLot.where().exec()
    return rows
      .filter((l) => ['COMPLETED', 'UNDER_REVIEW', 'IN_PROGRESS'].includes(l.statusId))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)
</script>

<template>
  <DashboardWidgetCard title="QC Inspection Lots" :count="lots.length" linkTo="/qc-inspection">
    <div v-if="!lots.length" class="tw:px-4 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
      No lots in progress.
    </div>
    <RouterLink
      v-for="l in lots.slice(0, 5)"
      :key="l.id"
      :to="getCompanyPath(`/qc-inspection/lots/${l.id}`)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:font-mono tw:truncate">{{ l.lotNumber }}</div>
        <div class="tw:text-xs tw:text-secondary">{{ l.inspectionPoint }}</div>
      </div>
      <InspectionLotStatusBadgeById :statusId="l.statusId" />
    </RouterLink>
  </DashboardWidgetCard>
</template>
