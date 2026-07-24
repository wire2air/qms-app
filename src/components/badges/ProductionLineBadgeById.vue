<script setup>
/**
 * Resolves a production-line id to its name (per-tenant `production_lines`
 * lookup) for read-only display. Plain text — lines are neutral.
 */
const props = defineProps({ lineId: { type: String, default: null } })

const line = useLiveQueryWithDeps(
  [() => props.lineId],
  async (db, [id]) => (id ? db.ProductionLine.findByPk(id) : null),
  { models: ['ProductionLine'] },
)
</script>

<template>
  <span v-if="line">{{ line.name }}<span v-if="line.area" class="tw:text-secondary"> · {{ line.area }}</span></span>
  <span v-else-if="lineId" class="tw:text-secondary">—</span>
</template>
