<script setup>
const props = defineProps({
  supplierId: {
    type: String,
    default: null,
  },
})

// SupplierOption (view `supplier_options`) — a badge only renders the name, and
// resolving an id to a name must work for users without supplier_management:read.
const supplier = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return null
    return db.SupplierOption.findByPk(supplierId)
  },

  { models: ['SupplierOption'], initial: null },
)
</script>

<template>
  <SupplierBadge v-if="supplier" :supplier="supplier" v-bind="$attrs" />
</template>
