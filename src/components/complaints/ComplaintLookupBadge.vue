<script setup>
/**
 * Generic read-only display of a complaint-lookup value by id. One component for
 * all 9 lookups — pass the syncEngine model name + the id. Renders the row's
 * name as a BaseBadge, tinted by the row's `color` when present (severity/risk).
 */
const props = defineProps({
  model: { type: String, required: true },
  id: { type: String, default: null },
  // Fallback text when the id is null/unresolved.
  placeholder: { type: String, default: '—' },
})

const row = useLiveQueryWithDeps(
  [() => props.model, () => props.id],
  async (db, [model, id]) => {
    if (!id) return null
    const Model = db[model]
    if (!Model) return null
    return Model.findByPk(id)
  },
  { models: [props.model] },
)
</script>

<template>
  <BaseBadge
    v-if="row"
    :style="row.color ? { backgroundColor: `${row.color}22`, color: row.color } : undefined"
  >
    {{ row.name || row.id }}
  </BaseBadge>
  <span v-else class="tw:text-sm tw:text-secondary">{{ placeholder }}</span>
</template>
