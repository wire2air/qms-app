<script setup>
/**
 * Employee Title select — backed by the per-tenant `employee_titles` lookup
 * (managed under Lookups → Employee Titles, pre-seeded with industry-standard
 * titles). Stores the chosen title's NAME (free text) so it stays compatible
 * with the existing `users.job_title` text column and everywhere that renders
 * it. If the user's current title isn't in the lookup (legacy free text), it's
 * injected as an extra option so the value still shows and isn't lost.
 */
defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select title —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const titles = useLiveQuery(
  (db) => db.EmployeeTitle.where().exec(),
  { models: ['EmployeeTitle'], initial: [] },
)

const options = computed(() => {
  const sorted = [...(titles.value || [])].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name),
  )
  const names = new Set(sorted.map((t) => t.name))
  // Keep a legacy / off-list value visible and selectable.
  if (modelValue.value && !names.has(modelValue.value)) {
    return [{ name: modelValue.value }, ...sorted]
  }
  return sorted
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="name"
    :nullLabel="nullLabel"
    :required="required"
    :clearable="!required"
  />
</template>
