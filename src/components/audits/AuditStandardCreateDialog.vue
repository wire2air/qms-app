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
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required } from '@shared/components/form/validators.js'

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
const saveError = ref('')
const codeDirty = ref(false)
const formRef = ref(null)
// Tracks whether the user clicked "Create & open" vs "Create".
const navigateAfterSave = ref(false)

function slugify(text) {
  return (
    (text || '')
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
      .replace(/_+/g, '_')
      // Industry codes are usually upper-case but allow either.
      .toUpperCase()
  )
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
    saveError.value = ''
  },
)

function close() {
  emit('update:modelValue', false)
}

function submitCreate() {
  navigateAfterSave.value = false
  formRef.value?.submit()
}

function submitCreateAndOpen() {
  navigateAfterSave.value = true
  formRef.value?.submit()
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
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
    if (navigateAfterSave.value && standard?.id) {
      router.push(getCompanyPath(`/audits/standards/${standard.id}`))
    }
  } catch (e) {
    saveError.value = e.message || 'Failed to create audit standard'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="New Audit Standard"
    maxWidth="lg"
    @update:modelValue="close"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField label="Name" required :value="form.name" :rules="[required()]">
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. ISO 9001:2015" />
          </template>
        </BaseField>

        <!-- Code field keeps its custom lock/override UI inside BaseField
             so the rule wires correctly and the label/error chrome is consistent. -->
        <BaseField label="Code" required :value="form.code" :rules="[required()]">
          <template #label>
            Code
            <span class="tw:font-normal tw:normal-case tw:ml-1">(auto-derived)</span>
          </template>
          <template #default="field">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:flex tw:justify-end">
                <button
                  type="button"
                  class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  @click="codeDirty = !codeDirty"
                >
                  {{ codeDirty ? 'Auto-derive from name' : 'Override' }}
                </button>
              </div>
              <BaseTextInput
                v-bind="field"
                v-model="form.code"
                placeholder="ISO_9001_2015"
                :disabled="!codeDirty"
                @input="codeDirty = true"
              />
            </div>
          </template>
        </BaseField>
        <p class="tw:text-caption tw:text-secondary">
          Per-tenant unique. Industry codes (ISO-9001-2015, AS9100-D) work too. Cannot be changed
          after creation — stamps onto every audit instance.
        </p>

        <BaseField label="Type">
          <AuditStandardTypeSelectMenu v-model="form.auditStandardTypeId" />
        </BaseField>
        <BaseField label="Description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.description"
              :rows="3"
              placeholder="Optional scope / context for this standard"
            />
          </template>
        </BaseField>
        <div
          class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800"
        >
          <strong>What happens next:</strong> a v1.0 DRAFT version is created automatically. Add
          your clauses on the detail page, then submit for approval to make it EFFECTIVE (workflow
          attachment + approval flow in next phase).
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="outline" :loading="saving" :disabled="saving" @click="submitCreate">
        Create
      </BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving"
        @click="submitCreateAndOpen"
      >
        Create &amp; open
      </BaseButton>
      <BaseErrorText v-if="saveError">{{ saveError }}</BaseErrorText>
    </template>
  </BaseDialog>
</template>
