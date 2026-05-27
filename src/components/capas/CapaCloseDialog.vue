<script setup>
/**
 * Close a CAPA + schedule its effectiveness check in one CFR-11-compliant flow.
 *
 * Backend (POST /v1/services/capas/{id}/close) requires:
 *   - effectivenessCheckAt — a future date for the post-closure EC follow-up
 *   - CFR-11 e-sign (method + token + optional provider)
 *
 * The flow:
 *   1. User picks an EC date + optional comments → clicks "Close CAPA".
 *   2. workflowInstanceEsignAuthDialog opens.
 *   3. On e-sign verified, this dialog POSTs the close request, then emits `closed`.
 */
import { DateTime } from 'luxon'
import { post } from '@/api'
import workflowInstanceEsignAuthDialog from '@/components/workflowInstance/workflowInstanceEsignAuthDialog.vue'

const props = defineProps({
  capaId: { type: String, required: true },
})
const emit = defineEmits(['closed'])
const isOpen = defineModel({ type: Boolean, default: false })
const toast = useToast()

// Default the EC date 90 days out — a reasonable cadence for QMS verification.
const ecDate = ref(null)
const comments = ref('')
const saving = ref(false)
const esignOpen = ref(false)
const esignData = ref(null)

watch(isOpen, (open) => {
  if (open) {
    ecDate.value = DateTime.now().plus({ days: 90 })
    comments.value = ''
    esignData.value = null
  }
})

function isFuture(dt) {
  return dt && DateTime.isDateTime(dt) && dt > DateTime.now()
}

function handleEsignVerified(data) {
  esignData.value = data
  esignOpen.value = false
  handleSubmit()
}

async function handleSubmit() {
  if (!isFuture(ecDate.value)) {
    toast.notify({
      type: 'negative',
      message: 'Effectiveness check date must be in the future',
    })
    return
  }
  if (!esignData.value) {
    esignOpen.value = true
    return
  }
  saving.value = true
  try {
    await post(`/v1/services/capas/${props.capaId}/close`, {
      effectivenessCheckAt: ecDate.value.toISO(),
      comments: comments.value || null,
      method: esignData.value.method,
      token: esignData.value.token,
      provider: esignData.value.provider || null,
    })
    toast.success('CAPA closed')
    isOpen.value = false
    emit('closed')
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to close CAPA' })
    esignData.value = null
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Close CAPA" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:py-1">
      <p class="tw:text-sm tw:text-secondary">
        Closing this CAPA finalises the workflow and schedules a follow-up effectiveness check.
        Requires e-signature verification.
      </p>

      <div class="tw:flex tw:flex-col tw:gap-1" data-testid="capa-close-ec-date">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Effectiveness check due <span class="tw:text-red-500">*</span>
        </label>
        <BaseDatePicker v-model="ecDate" :minDate="DateTime.now().plus({ days: 1 })" />
        <p class="tw:text-xs tw:text-secondary">
          The system will create a follow-up task on this date to verify the CAPA worked.
        </p>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Closure notes <span class="tw:text-xs tw:text-secondary">(optional)</span>
        </label>
        <BaseTextarea
          v-model="comments"
          placeholder="Summary of evidence, residual risks, etc."
          :rows="3"
        />
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="isOpen = false">
          Cancel
        </BaseButton>
        <BaseButton
          variant="danger"
          data-testid="capa-close-confirm"
          :disabled="!isFuture(ecDate) || saving"
          @click="handleSubmit"
        >
          {{ saving ? 'Closing…' : 'Close CAPA' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>

  <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="handleEsignVerified" />
</template>
