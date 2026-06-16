<script setup>
const props = defineProps({
  statusId: {
    type: String,
    default: null,
  },
  showDot: {
    type: Boolean,
    default: true,
  },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.ProductStatus.findByPk(statusId)
  },

  { models: ['ProductStatus'], initial: null },
)
</script>

<template>
  <ProductStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
  <BaseBadge v-else v-bind="$attrs">—</BaseBadge>
</template>
