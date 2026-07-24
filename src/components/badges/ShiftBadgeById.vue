<script setup>
/**
 * Resolves a shift id to its name (per-tenant `shifts` lookup) for read-only
 * display. Renders plain text (not a colored badge) — shifts are neutral.
 */
const props = defineProps({ shiftId: { type: String, default: null } })

const shift = useLiveQueryWithDeps(
  [() => props.shiftId],
  async (db, [id]) => (id ? db.Shift.findByPk(id) : null),
  { models: ['Shift'] },
)
</script>

<template>
  <span v-if="shift">{{ shift.name }}</span>
  <span v-else-if="shiftId" class="tw:text-secondary">—</span>
</template>
