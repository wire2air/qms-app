<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  ncId: { type: String, required: true },
})

const nc = useLiveQueryWithDeps([() => props.ncId], async (db, [id]) =>
  db.Nonconformance.findByPk(id),
)
</script>

<template>
  <RouterLink
    v-if="nc"
    :to="getCompanyPath(`/nonconformances/${nc.id}`)"
    class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:hover:underline"
  >
    <span class="tw:font-mono tw:text-xs tw:text-secondary">{{ nc.ncNumber || nc.id }}</span>
    <span class="tw:text-on-main tw:truncate">{{ nc.title }}</span>
    <NcStatusBadgeById v-if="nc.statusId" :statusId="nc.statusId" />
  </RouterLink>
  <span v-else class="tw:text-xs tw:text-secondary tw:font-mono">{{ ncId }}</span>
</template>
