<script setup>
const props = defineProps({
  productId: {
    type: String,
    default: null,
  },
})

// ProductOption (view `product_options`) — the badge renders SKU + name, and
// must resolve for users without products:read.
const product = useLiveQueryWithDeps(
  [() => props.productId],
  async (db, [productId]) => {
    if (!productId) return null
    return db.ProductOption.findByPk(productId)
  },

  { models: ['ProductOption'], initial: null },
)
</script>

<template>
  <ProductBadge v-if="product" :product="product" v-bind="$attrs" />
</template>
