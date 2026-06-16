<script setup>
const props = defineProps({
  supplierId: {
    type: String,
    default: null,
  },
})

const supplier = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return null
    return db.Supplier.findByPk(supplierId)
  },

  { models: ['Supplier'], initial: null },
)
</script>

<template>
  <SupplierBadge v-if="supplier" :supplier="supplier" v-bind="$attrs" />
</template>
