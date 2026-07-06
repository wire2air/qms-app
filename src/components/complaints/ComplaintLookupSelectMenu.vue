<script setup>
/**
 * Generic per-tenant complaint-lookup select. One component for all 9 complaint
 * lookups (source/region/country/customer-type/category/sub-category/type/
 * severity/risk) — pass the syncEngine model name. Supports dependent filtering
 * (Country by region, Sub-category by category) via `parentField` + `parentId`.
 * Wraps BaseSelect (the triad's SelectMenu role, parametrised by model).
 */
const props = defineProps({
  // syncEngine model class name, e.g. 'ComplaintRegion'.
  model: { type: String, required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  // Dependent dropdowns: only rows whose parentField === parentId are shown.
  parentField: { type: String, default: null },
  parentId: { type: String, default: null },
  nullLabel: { type: String, default: '— Select —' },
  placeholder: { type: String, default: 'Select…' },
  disabled: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const rows = useLiveQueryWithDeps(
  [() => props.model, () => props.parentField, () => props.parentId],
  async (db, [model, parentField, parentId]) => {
    const Model = db[model]
    if (!Model) return []
    let list = await Model.where().exec()
    if (parentField) list = list.filter((r) => r[parentField] === parentId)
    return list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  },
  { models: [props.model], initial: [] },
)

// Clear a now-invalid selection when the parent filter changes (e.g. category
// switched, so the old sub-category no longer belongs).
watch(rows, (list) => {
  if (!modelValue.value || props.multiple) return
  if (!list.some((r) => r.id === modelValue.value)) modelValue.value = null
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="rows"
    optionLabel="name"
    optionValue="id"
    :nullLabel="nullLabel"
    :placeholder="placeholder"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :disabled="disabled"
  />
</template>
