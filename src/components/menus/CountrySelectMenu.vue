<script setup>
/**
 * Country select — the GLOBAL ISO country lookup (companyId NULL rows synced
 * to every tenant). Common trading partners first, then alphabetical.
 */
defineProps({
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select country —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const countries = useLiveQuery((db) => db.Country.where().exec(), {
  models: ['Country'],
  initial: [],
})

const options = computed(() =>
  [...(countries.value || [])].sort(
    (a, b) =>
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
      (a.name || '').localeCompare(b.name || ''),
  ),
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
    searchable
  />
</template>
