<script setup>
/**
 * Shift select — backed by the per-tenant `shifts` lookup (Day / Evening /
 * Night …). Binds the shift's FK id. Options show the shift name + its time
 * window when set. Companies provisioned before shifts existed may have none
 * yet, so this offers an inline "Add New Shift" the way other entity selects do.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select shift —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const toast = useToast()
const shifts = useLiveQuery((db) => db.Shift.where().exec(), { models: ['Shift'], initial: [] })

const options = computed(() =>
  [...(shifts.value || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      label:
        s.startTime && s.endTime
          ? `${s.name} (${String(s.startTime).slice(0, 5)}–${String(s.endTime).slice(0, 5)})`
          : s.name,
    })),
)

const canCreateShift = computed(() => isAllowed(['inspection_qc:create']))
const showCreateDialog = ref(false)
const newShiftName = ref('')
const creating = ref(false)
const createError = ref('')

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function openCreateDialog(closePopover) {
  closePopover?.()
  newShiftName.value = ''
  createError.value = ''
  showCreateDialog.value = true
}

const createShift = useLiveMutation(async (db, payload) => {
  const row = db.Shift.create(payload)
  await row.save()
  return row
})

async function onCreateSubmit() {
  const name = newShiftName.value.trim()
  if (!name) return
  creating.value = true
  createError.value = ''
  try {
    const row = await createShift({
      name,
      code: slugify(name),
      displayOrder: (shifts.value?.length ?? 0) * 100 + 100,
    })
    toast.success('Shift created')
    modelValue.value = row.id
    showCreateDialog.value = false
  } catch (e) {
    createError.value = e.message || 'Failed to create shift'
  } finally {
    creating.value = false
  }
}
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
  >
    <template v-if="canCreateShift" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreateDialog(close)"
      >
        <IconPlus :size="16" />
        Add New Shift
      </button>
    </template>
  </BaseSelect>

  <BaseDialog v-model="showCreateDialog" title="Add Shift" maxWidth="sm">
    <div class="tw:p-5">
      <BaseField label="Name" required>
        <BaseTextInput v-model="newShiftName" placeholder="e.g. Day" @keyup.enter="onCreateSubmit" />
      </BaseField>
    </div>
    <template #footer>
      <BaseDialogFooter
        submitLabel="Add"
        :loading="creating"
        :error="createError"
        :disabled="!newShiftName.trim()"
        @cancel="showCreateDialog = false"
        @submit="onCreateSubmit"
      />
    </template>
  </BaseDialog>
</template>
