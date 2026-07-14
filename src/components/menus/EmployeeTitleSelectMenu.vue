<script setup>
/**
 * Employee Title select for INTERNAL staff — backed by the per-tenant
 * `employee_titles` lookup (managed under Lookups → Employee Titles). Binds the
 * title's FK id (v-model = employeeTitleId) and emits `update:name` with the
 * chosen title's name so the parent can keep the denormalized `jobTitle`
 * display string in sync (the session payload + display sites read job_title).
 */
defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select title —' },
})
const emit = defineEmits(['update:name'])
const modelValue = defineModel({ type: [String, null], default: null })

const titles = useLiveQuery((db) => db.EmployeeTitle.where().exec(), {
  models: ['EmployeeTitle'],
  initial: [],
})

const options = computed(() =>
  [...(titles.value || [])].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name),
  ),
)

function onChange(id) {
  emit('update:name', options.value.find((t) => t.id === id)?.name || '')
}
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="id"
    :nullLabel="nullLabel"
    :required="required"
    :clearable="!required"
    @update:modelValue="onChange"
  />
</template>
