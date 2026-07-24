<script setup>
/**
 * Unit of Measure select (per-tenant uoms lookup) for the Item Master. Optional
 * / clearable — leaving it blank means "N/A". Inline "Add New" (footer button →
 * quick create) so a user can add a missing unit without leaving the form; full
 * management lives in Settings → Lookups → Units of Measure. Gated by
 * company_settings:manage (same gate as the REST endpoint).
 */
import { IconPlus } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  allowCreate: { type: Boolean, default: true },
  nullLabel: { type: String, default: '— N/A —' },
  // Which field to bind: 'id' (FK, Item Master) or 'code' / 'name' (store the
  // value, e.g. inspection specs — our convention is to store the value).
  bindValue: { type: String, default: 'id' },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })
const toast = useToast()

const uoms = useLiveQuery((db) => db.Uom.where().orderBy('displayOrder').exec(), {
  models: ['Uom'],
  initial: [],
})

// ── Inline add ────────────────────────────────────────────────────────────────
const canCreate = computed(
  () => props.allowCreate && isAllowed(['company_settings:manage', 'owner']),
)
const showCreate = ref(false)
const newName = ref('')
const newCode = ref('')
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
  newCode.value = ''
  showCreate.value = true
}

async function submitCreate() {
  const name = newName.value.trim()
  const code = (newCode.value.trim() || slugify(name)).toUpperCase()
  if (!name) {
    toast.warning('Name is required')
    return
  }
  saving.value = true
  try {
    const res = await post('/v1/services/uoms', {
      code,
      name,
      description: null,
      displayOrder: (uoms.value?.length ?? 0) * 100 + 100,
    })
    const row = res?.uom ?? res
    const bound = row?.[props.bindValue]
    if (bound != null) {
      if (props.multiple) {
        const arr = Array.isArray(modelValue.value) ? modelValue.value : []
        if (!arr.includes(bound)) modelValue.value = [...arr, bound]
      } else {
        modelValue.value = bound
      }
    }
    toast.success('Unit created')
    showCreate.value = false
    newName.value = ''
    newCode.value = ''
  } catch (e) {
    toast.error(e?.message || 'Failed to create unit')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="uoms"
    optionLabel="name"
    :optionValue="bindValue"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
    placeholder="Select unit…"
  >
    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        Add New Unit
      </button>
    </template>
  </BaseSelect>

  <BaseDialog v-model="showCreate" title="New unit of measure" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Name</BaseText>
        <BaseTextInput v-model="newName" placeholder="e.g. Each (ea)" autofocus @keyup.enter="submitCreate" />
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Code (optional)</BaseText>
        <BaseTextInput v-model="newCode" placeholder="Auto-derived from name (e.g. EA)" @keyup.enter="submitCreate" />
      </div>
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
