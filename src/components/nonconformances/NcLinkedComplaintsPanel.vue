<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Customer complaints this NC was raised from (CC → NC conversion).
 * Resolves through the generic nc_source_links table — self-hides when
 * the NC has no complaint origin, mirroring AuditOriginPanel.
 */
const props = defineProps({
  ncId: { type: String, required: true },
})

const links = useLiveQueryWithDeps(
  [() => props.ncId],
  async (db, [ncId]) => {
    if (!ncId) return []
    const rows = await db.NcSourceLink.where('ncId', ncId).exec()
    return rows.filter((l) => l.sourceType === 'CUSTOMER_COMPLAINT')
  },

  { models: ['NcSourceLink'], initial: [] },
)

const complaintIdList = computed(() => links.value.map((l) => l.sourceId).join(','))
const complaints = useLiveQueryWithDeps(
  [() => complaintIdList.value],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const rows = await Promise.all(ids.map((id) => db.CustomerComplaint.findByPk(id)))
    return rows.filter(Boolean)
  },

  { models: ['CustomerComplaint'], initial: [] },
)
</script>

<template>
  <div v-if="links.length" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
    <BaseText
      variant="overline"
      class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
    >
      Linked Complaints
    </BaseText>
    <div class="tw:flex tw:flex-col tw:gap-2">
      <RouterLink
        v-for="complaint in complaints"
        :key="complaint.id"
        :to="getCompanyPath(`/customer-complaints/${complaint.id}`)"
        class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <span class="tw:text-xs tw:font-mono tw:text-secondary">
            {{ complaint.complaintNumber }}
          </span>
          <span class="tw:text-sm tw:font-medium tw:truncate">{{ complaint.subject }}</span>
        </div>
        <CustomerComplaintStatusBadgeById :statusId="complaint.statusId" />
      </RouterLink>
    </div>
  </div>
</template>
