<script setup>
/**
 * Region select — the GLOBAL region lookup (NA / EU / APAC / LATAM / MEA).
 */
defineProps({
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select region —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const regions = useLiveQuery((db) => db.Region.where().exec(), {
  models: ['Region'],
  initial: [],
})

const options = computed(() =>
  [...(regions.value || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="id"
    :nullLabel="nullLabel"
    :required="required"
    :disabled="disabled"
    :clearable="!required"
  />
</template>
