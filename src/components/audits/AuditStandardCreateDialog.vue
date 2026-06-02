<script setup>
/**
 * Create-new-audit-standard dialog.
 *
 * Posts to POST /v1/services/auditStandards which auto-mints a v1.0
 * DRAFT version on the BE side. On success emits `created` with the
 * standard id so the parent can navigate to the new detail page.
 *
 * Code field auto-derives from the name as the user types; user can
 * override (industry codes use canonical forms like "ISO-9001-2015"
 * which won't slugify cleanly).
 */
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const router = useRouter()
const toast = useToast()

const form = ref({
  code: '',
  name: '',
  description: '',
  auditStandardTypeId: null,
})
const saving = ref(false)
const codeDirty = ref(false)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .replace(/_+/g, '_')
    // Industry codes are usually upper-case but allow either.
    .toUpperCase()
}

watch(
  () => form.value.name,
  (newName) => {
    if (codeDirty.value) return
    form.value.code = slugify(newName)
  },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    // Reset on open.
    form.value = {
      code: '',
      name: '',
      description: '',
      auditStandardTypeId: null,
    }
    codeDirty.value = false
  },
)

function close() {
  emit('update:modelValue', false)
}

async function handleSave({ navigate }) {
  if (!form.value.name.trim()) {
    toast.warning('Name is required')
    return
  }
  if (!form.value.code.trim()) {
    toast.warning('Code is required')
    return
  }
  saving.value = true
  try {
    const result = await post('/v1/services/auditStandards', {
      code: form.value.code.trim(),
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
      auditStandardTypeId: form.value.auditStandardTypeId || null,
    })
    const standard = result?.standard
    toast.success(`Audit standard "${standard?.name}" created`)
    emit('created', standard)
    close()
    if (navigate && standard?.id) {
      router.push(getCompanyPath(`/audits/standards/${standard.id}`))
    }
  } catch (e) {
    toast.error(e.message || 'Failed to create audit standard')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" title="New Audit Standard" maxWidth="lg" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Name <span class="tw:text-red-500">*</span>
        </p>
        <BaseTextInput v-model="form.name" placeholder="e.g. ISO 9001:2015" />
      </div>
      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
            Code <span class="tw:text-red-500">*</span>
          </p>
          <button
            type="button"
            class="tw:text-[11px] tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="codeDirty = !codeDirty"
          >
            {{ codeDirty ? 'Auto-derive from name' : 'Override' }}
          </button>
        </div>
        <BaseTextInput
          v-model="form.code"
          placeholder="ISO_9001_2015"
          :disabled="!codeDirty"
          @input="codeDirty = true"
        />
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
          Per-tenant unique. Industry codes (ISO-9001-2015, AS9100-D) work too.
          Cannot be changed after creation — stamps onto every audit instance.
        </p>
      </div>
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Type</p>
        <AuditStandardTypeSelectMenu v-model="form.auditStandardTypeId" />
      </div>
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
        <BaseTextarea
          v-model="form.description"
          :rows="3"
          placeholder="Optional scope / context for this standard"
        />
      </div>
      <div class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800">
        <strong>What happens next:</strong> a v1.0 DRAFT version is created automatically.
        Add your clauses on the detail page, then submit for approval to make it EFFECTIVE
        (workflow attachment + approval flow in next phase).
      </div>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="outline"
        :loading="saving"
        :disabled="saving"
        @click="handleSave({ navigate: false })"
      >
        Create
      </BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving"
        @click="handleSave({ navigate: true })"
      >
        Create &amp; open
      </BaseButton>
    </template>
  </BaseDialog>
</template>
