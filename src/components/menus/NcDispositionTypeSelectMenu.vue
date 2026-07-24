<script setup>
/**
 * Disposition-type select (shared nc_disposition_types lookup — QC lots + NCs).
 * Inline "Add New" (footer button → quick create) so a reviewer can add a
 * missing disposition without leaving the record — same pattern as
 * EventCategorySelectMenu / ComplaintLookupSelectMenu. Full management (adverse
 * flag, cost tracking, order) lives in Lookups → NC Dispositions.
 */
import { IconPlus } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  allowCreate: { type: Boolean, default: true },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })
const toast = useToast()

const dispositionTypes = useLiveQuery(
  (db) => db.NcDispositionType.where().orderBy('displayOrder').exec(),

  { models: ['NcDispositionType'], initial: [] },
)

// ── Inline add ────────────────────────────────────────────────────────────────
// Gated by the same permission Lookups → NC Dispositions uses.
const canCreate = computed(() => props.allowCreate && isAllowed(['nc_disposition_types:manage']))
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
    const res = await post('/v1/services/ncDispositionTypes', {
      code: slugify(name),
      name,
      description: null,
      displayOrder: (dispositionTypes.value?.length ?? 0) * 100 + 100,
      tracksCost: false,
    })
    const row = res?.dispositionType ?? res
    if (row?.id) {
      if (props.multiple) {
        const arr = Array.isArray(modelValue.value) ? modelValue.value : []
        if (!arr.includes(row.id)) modelValue.value = [...arr, row.id]
      } else {
        modelValue.value = row.id
      }
    }
    toast.success('Disposition created')
    showCreate.value = false
    newName.value = ''
  } catch (e) {
    toast.error(e?.message || 'Failed to create disposition')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="dispositionTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All dispositions —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <NcDispositionTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :dispositionTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>

    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        Add New Disposition
      </button>
    </template>
  </BaseSelect>

  <BaseDialog v-model="showCreate" title="New disposition" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-1">
      <BaseText as="div" variant="overline">Name</BaseText>
      <BaseTextInput v-model="newName" placeholder="e.g. Use As Is" autofocus @keyup.enter="submitCreate" />
      <p class="tw:mt-1 tw:text-xs tw:text-secondary">
        New dispositions are treated as adverse by default. Adjust the adverse / cost flags in
        Lookups → NC Dispositions.
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
