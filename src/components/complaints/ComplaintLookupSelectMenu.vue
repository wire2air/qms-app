<script setup>
/**
 * Generic per-tenant complaint-lookup select. One component for all 9 complaint
 * lookups (source/region/country/customer-type/category/sub-category/type/
 * severity/risk) — pass the syncEngine model name. Supports dependent filtering
 * (Country by region, Sub-category by category) via `parentField` + `parentId`.
 * Wraps BaseSelect (the triad's SelectMenu role, parametrised by model).
 *
 * Inline "add" (footer button → quick create) so a user can add a missing
 * option without leaving the form — same pattern as DepartmentSelectMenu.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  // syncEngine model class name, e.g. 'ComplaintCategory' (or the global
  // 'Region'/'Country' lookups — pass :allowCreate="false" for those).
  model: { type: String, required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  // Dependent dropdowns: only rows whose parentField === parentId are shown.
  parentField: { type: String, default: null },
  parentId: { type: String, default: null },
  nullLabel: { type: String, default: '— Select —' },
  placeholder: { type: String, default: 'Select…' },
  disabled: { type: Boolean, default: false },
  // Inline-create affordance. Label shown on the footer button + dialog title.
  allowCreate: { type: Boolean, default: true },
  createLabel: { type: String, default: 'Add New' },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const rows = useLiveQueryWithDeps(
  [() => props.model, () => props.parentField, () => props.parentId],
  async (db, [model, parentField, parentId]) => {
    const Model = db[model]
    if (!Model) return []
    let list = await Model.where().exec()
    if (parentField) list = list.filter((r) => r[parentField] === parentId)
    // Name tiebreak so large equal-order lists (e.g. the 199 global
    // countries at displayOrder 10000) come out alphabetical.
    return list.sort(
      (a, b) =>
        (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
        (a.name || '').localeCompare(b.name || ''),
    )
  },
  { models: [props.model], initial: [] },
)

// Clear a now-invalid selection when the parent filter changes (e.g. category
// switched, so the old sub-category no longer belongs).
watch(rows, (list) => {
  if (!modelValue.value || props.multiple) return
  if (!list.some((r) => r.id === modelValue.value)) modelValue.value = null
})

// ── Inline add ───────────────────────────────────────────────────────────────
// Complaint lookups are managed via syncEngine (same as ComplaintLookupCard),
// gated by the complaint-config permission. Shown for every lookup, including
// dependent ones (sub-category / country) — createRow stamps the chosen parent
// when one is selected, otherwise the new row is a top-level entry.
const canCreate = computed(
  () =>
    props.allowCreate &&
    (isAllowed(['complaint_management:update']) || isAllowed(['complaints:update'])),
)
const showCreate = ref(false)
const newName = ref('')
const saving = ref(false)
const toast = useToast()

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

const createRow = useLiveMutation(async (db, name) => {
  const payload = {
    code: slugify(name),
    name,
    displayOrder: (rows.value?.length ?? 0) * 100 + 100,
  }
  // Dependent lookup (sub-category/country) — stamp the chosen parent.
  if (props.parentField && props.parentId) payload[props.parentField] = props.parentId
  const row = db[props.model].create(payload)
  await row.save()
  return row
})

function openCreate(closePopover) {
  closePopover?.()
  newName.value = ''
  showCreate.value = true
}

async function submitCreate() {
  const name = newName.value.trim()
  if (!name) {
    toast.warning('Name is required')
    return
  }
  saving.value = true
  try {
    const row = await createRow(name)
    if (row?.id) {
      if (props.multiple) {
        const arr = Array.isArray(modelValue.value) ? modelValue.value : []
        if (!arr.includes(row.id)) modelValue.value = [...arr, row.id]
      } else {
        modelValue.value = row.id
      }
    }
    showCreate.value = false
    newName.value = ''
  } catch (e) {
    toast.error(e?.message || 'Failed to create')
  } finally {
    saving.value = false
  }
}
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
  >
    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        {{ createLabel }}
      </button>
    </template>
  </BaseSelect>

  <BaseDialog v-model="showCreate" :title="createLabel" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-1">
      <BaseText as="div" variant="overline">Name</BaseText>
      <BaseTextInput v-model="newName" placeholder="Enter a name" autofocus @keyup.enter="submitCreate" />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Create"
        :loading="saving"
        :disabled="!newName.trim()"
        @cancel="close"
        @submit="submitCreate"
      />
    </template>
  </BaseDialog>
</template>
