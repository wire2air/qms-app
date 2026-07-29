<script setup>
/**
 * Record the e-signed destruction of a retain sample (single-action pattern —
 * same shape as the QC Record-Disposition / CAPA effectiveness flows). The
 * PIN e-sign dialog collects identity; the API verifies it (CFR-11) before
 * the DISPOSED state + custody event land.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import workflowInstanceEsignAuthDialog from '@/components/workflowInstance/workflowInstanceEsignAuthDialog.vue'

const props = defineProps({
  sampleId: { type: String, required: true },
  rsNumber: { type: String, default: '' },
})
const emit = defineEmits(['disposed'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const METHODS = ['Destroyed on site', 'Incinerated', 'Returned to batch', 'Sent for disposal', 'Other']
const disposalMethod = ref(METHODS[0])
const disposalNotes = ref('')
const saving = ref(false)
const esignOpen = ref(false)
const esignData = ref(null)

watch(show, (open) => {
  if (!open) return
  disposalMethod.value = METHODS[0]
  disposalNotes.value = ''
  esignData.value = null
})

function onSubmit() {
  if (!esignData.value) {
    esignOpen.value = true
    return
  }
  doDispose()
}

function handleEsignVerified(data) {
  esignData.value = data
  esignOpen.value = false
  doDispose()
}

async function doDispose() {
  if (saving.value) return
  saving.value = true
  try {
    await post(`/v1/services/qcInspection/retainSamples/${props.sampleId}/dispose`, {
      disposalMethod: disposalMethod.value,
      disposalNotes: disposalNotes.value.trim() || null,
      method: esignData.value.method,
      token: esignData.value.token,
      provider: esignData.value.provider || null,
    })
    toast.success('Disposal recorded')
    show.value = false
    emit('disposed')
  } catch (err) {
    toast.error(err?.message || 'Failed to record disposal')
    esignData.value = null
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="`Record Disposal — ${rsNumber}`" maxWidth="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Records the destruction of this retained sample. This is e-signed and final — the record
        stays in the register as the destruction evidence, but the sample can no longer be edited.
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Disposal method" required>
        <select
          :id="fieldId"
          v-model="disposalMethod"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
        >
          <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
        </select>
      </BaseField>
      <BaseField v-slot="{ id: fieldId }" label="Notes" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="disposalNotes"
          :rows="2"
          placeholder="Witness, certificate reference, anything worth recording"
        />
      </BaseField>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Sign & Record Disposal"
        :loading="saving"
        :disabled="saving"
        @cancel="close"
        @submit="onSubmit"
      />
    </template>

    <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="handleEsignVerified" />
  </BaseDialog>
</template>
