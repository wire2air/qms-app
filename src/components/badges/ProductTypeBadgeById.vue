<script setup>
const props = defineProps({
  productTypeId: {
    type: String,
    default: null,
  },
})

const type = useLiveQueryWithDeps(
  [() => props.productTypeId],
  async (db, [productTypeId]) => {
    if (!productTypeId) return null
    return db.ProductType.findByPk(productTypeId)
  },

  { models: ['ProductType'], initial: null },
)
</script>

<template>
  <ProductTypeBadge v-if="type" :type="type" v-bind="$attrs" />
  <BaseBadge v-else v-bind="$attrs">—</BaseBadge>
</template>
