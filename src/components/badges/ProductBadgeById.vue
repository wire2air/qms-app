<script setup>
const props = defineProps({
  productId: {
    type: String,
    default: null,
  },
})

const product = useLiveQueryWithDeps(
  [() => props.productId],
  async (db, [productId]) => {
    if (!productId) return null
    return db.Product.findByPk(productId)
  },

  { models: ['Product'], initial: null },
)
</script>

<template>
  <ProductBadge v-if="product" :product="product" v-bind="$attrs" />
</template>
