<script setup>
const props = defineProps({
  equipmentId: { type: String, default: null },
})

const equipment = useLiveQueryWithDeps(
  [() => props.equipmentId],
  async (db, [equipmentId]) => {
    if (!equipmentId) return null
    return db.Equipment.findByPk(equipmentId)
  },
  // Initial-load fallback so the badge renders the id immediately
  // while IDB resolves — matches the SiteBadgeById pattern's intent
  // by giving EquipmentBadge a minimal object to display.
  {
    initial: () => (props.equipmentId ? { id: props.equipmentId } : null),
  },
)
</script>

<template>
  <EquipmentBadge v-if="equipment" :equipment="equipment" v-bind="$attrs" />
</template>
