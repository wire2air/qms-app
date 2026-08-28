<script setup>
const props = defineProps({ uomId: { type: String, default: null } })
const uom = useLiveQueryWithDeps(
  [() => props.uomId],
  async (db, [uomId]) => {
    if (!uomId) return null
    return db.Uom.findByPk(uomId)
  },
  { models: ['Uom'], initial: () => (props.uomId ? { id: props.uomId } : null) },
)
</script>

<template>
  <UomBadge v-if="uom" :uom="uom" v-bind="$attrs" />
</template>
