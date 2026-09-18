<script setup>
/**
 * Production line select — backed by the per-tenant `production_lines` lookup.
 * Binds the line's FK id. Options show the line name + its area when set.
 */
defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select line —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const lines = useLiveQuery((db) => db.ProductionLine.where().exec(), {
  models: ['ProductionLine'],
  initial: [],
})

const options = computed(() =>
  [...(lines.value || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, label: l.area ? `${l.name} · ${l.area}` : l.name })),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="label"
    optionValue="id"
    :nullLabel="nullLabel"
    :required="required"
    :clearable="!required"
  />
</template>
