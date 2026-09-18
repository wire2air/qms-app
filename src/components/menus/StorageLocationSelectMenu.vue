<script setup>
/**
 * Storage location select — backed by the per-tenant `storage_locations`
 * lookup (retain sample storage). Binds the location's FK id; options show
 * the name + required conditions when set.
 */
defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select location —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const locations = useLiveQuery((db) => db.StorageLocation.where().exec(), {
  models: ['StorageLocation'],
  initial: [],
})

const options = computed(() =>
  [...(locations.value || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, label: l.conditions ? `${l.name} · ${l.conditions}` : l.name })),
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
