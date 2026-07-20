<script setup>
/**
 * Item Category select (per-tenant item_categories lookup) — the market /
 * product-line taxonomy (Skin Care, Hair Care …). Inline "Add New" so a user can
 * add a missing category without leaving the form; full management lives in
 * Settings → Lookups → Item Categories. Gated by company_settings:manage.
 */
import { IconPlus } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  allowCreate: { type: Boolean, default: true },
  nullLabel: { type: String, default: '— No category —' },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })
const toast = useToast()

const categories = useLiveQuery((db) => db.ItemCategory.where().orderBy('displayOrder').exec(), {
  models: ['ItemCategory'],
  initial: [],
})

const canCreate = computed(
  () => props.allowCreate && isAllowed(['company_settings:manage', 'owner']),
)
const showCreate = ref(false)
const newName = ref('')
const saving = ref(false)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

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
    const res = await post('/v1/services/itemCategories', {
      code: slugify(name),
      name,
      description: null,
      displayOrder: (categories.value?.length ?? 0) * 100 + 100,
    })
    const row = res?.itemCategory ?? res
    if (row?.id) {
      if (props.multiple) {
        const arr = Array.isArray(modelValue.value) ? modelValue.value : []
        if (!arr.includes(row.id)) modelValue.value = [...arr, row.id]
      } else {
        modelValue.value = row.id
      }
    }
    toast.success('Category created')
    showCreate.value = false
    newName.value = ''
  } catch (e) {
    toast.error(e?.message || 'Failed to create category')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="categories"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
    placeholder="Select category…"
  >
    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        Add New Category
      </button>
    </template>
  </BaseSelect>

  <BaseDialog v-model="showCreate" title="New item category" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-1">
      <BaseText as="div" variant="overline">Name</BaseText>
      <BaseTextInput v-model="newName" placeholder="e.g. Skin Care" autofocus @keyup.enter="submitCreate" />
      <p class="tw:mt-1 tw:text-xs tw:text-secondary">
        Market / product line (Skin Care, Hair Care). Manage full list in Lookups → Item Categories.
      </p>
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
