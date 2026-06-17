<script setup>
const props = defineProps({
  productFamilyId: {
    type: String,
    default: null,
  },
})

const productFamily = useLiveQueryWithDeps(
  [() => props.productFamilyId],
  async (db, [id]) => {
    if (!id) return null
    return db.ProductFamily.findByPk(id)
  },
  { models: ['ProductFamily'], initial: null },
)
</script>

<template>
  <ProductFamilyBadge v-if="productFamily" :productFamily="productFamily" v-bind="$attrs" />
</template>
