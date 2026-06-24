<script setup>
/**
 * Clone (duplicate) an audit standard into a new one. Asks for a new per-tenant
 * code + name (pre-filled), POSTs to /auditStandards/:id/clone — which copies
 * the parent metadata + the source's clause list (hierarchy + guided-audit
 * content preserved) into a fresh v1.0 DRAFT — then opens the new standard.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // The source standard being cloned ({ id, code, name }).
  standard: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'cloned'])

const router = useRouter()
const toast = useToast()

const form = ref({ code: '', name: '' })
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)
// Tracks whether the user clicked "Duplicate & open" vs "Duplicate".
const navigateAfterSave = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.standard) return
    const base = (props.standard.code || 'STD').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 90)
    form.value = {
      code: `${base}-COPY`,
      name: `Copy of ${props.standard.name || ''}`.trim(),
    }
    saveError.value = ''
  },
)

function close() {
  emit('update:modelValue', false)
}

function submitDuplicate() {
  navigateAfterSave.value = false
  formRef.value?.submit()
}

function submitDuplicateAndOpen() {
  navigateAfterSave.value = true
  formRef.value?.submit()
}

async function onValidSubmit() {
  if (!props.standard?.id) return
  saving.value = true
  saveError.value = ''
  try {
    const result = await post(`/v1/services/auditStandards/${props.standard.id}/clone`, {
      code: form.value.code.trim(),
      name: form.value.name.trim(),
    })
    const standard = result?.standard
    toast.success(`Cloned to "${standard?.name}"`)
    emit('cloned', standard)
    close()
    if (navigateAfterSave.value && standard?.id) {
      router.push(getCompanyPath(`/audits/standards/${standard.id}`))
    }
  } catch (e) {
    saveError.value = e.message || 'Failed to clone audit standard'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="Duplicate Audit Standard"
    maxWidth="lg"
    @update:modelValue="close"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-xs tw:text-secondary">
          Copies <strong>{{ standard?.name }}</strong> and all its clauses into a new standard as a
          v1.0 DRAFT. Give it a new code + name.
        </p>
        <BaseField label="Name" required :value="form.name" :rules="[required()]">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.name"
              placeholder="e.g. Copy of ISO 9001:2015"
            />
          </template>
        </BaseField>
        <BaseField
          label="Code"
          required
          hint="Per-tenant unique. Cannot be changed after creation."
          :value="form.code"
          :rules="[required()]"
        >
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="form.code" placeholder="ISO_9001_2015-COPY" />
          </template>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="outline" :loading="saving" :disabled="saving" @click="submitDuplicate">
        Duplicate
      </BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving"
        @click="submitDuplicateAndOpen"
      >
        Duplicate &amp; open
      </BaseButton>
      <BaseErrorText v-if="saveError">{{ saveError }}</BaseErrorText>
    </template>
  </BaseDialog>
</template>
