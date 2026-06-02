<script setup>
import { post } from '@/api'
import workflowInstanceEsignAuthDialog from '@/components/workflowInstance/workflowInstanceEsignAuthDialog.vue'

const props = defineProps({
  capaId: { type: String, required: true },
  checkId: { type: String, default: null },
})

const emit = defineEmits(['completed'])
const isOpen = defineModel({ type: Boolean, default: false })
const toast = useToast()
const outcome = ref(null)
const comments = ref('')
const saving = ref(false)
const esignOpen = ref(false)
const esignData = ref(null)

watch(isOpen, (open) => {
  if (open) {
    outcome.value = null
    comments.value = ''
    esignData.value = null
  }
})

function handleEsignVerified(data) {
  esignData.value = data
  esignOpen.value = false
  handleSubmit()
}

async function handleSubmit() {
  if (!props.checkId) return
  if (!outcome.value) {
    toast.notify({ type: 'negative', message: 'Please select an outcome' })
    return
  }
  if (!comments.value?.trim()) {
    toast.notify({ type: 'negative', message: 'Verification notes are required' })
    return
  }
  if (!esignData.value) {
    esignOpen.value = true
    return
  }
  saving.value = true
  try {
    const response = await post(
      `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/complete`,
      {
        outcome: outcome.value,
        comments: comments.value,
        method: esignData.value.method,
        token: esignData.value.token,
        provider: esignData.value.provider || null,
      },
    )
    toast.success('Effectiveness check completed')
    isOpen.value = false
    emit('completed', response.effectivenessCheck)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to complete' })
    esignData.value = null
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Complete Effectiveness Check" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Confirm the CAPA is working — the corrective and preventive actions are preventing the issue
        from recurring. This requires e-signature verification.
      </p>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Outcome <span class="tw:text-red-500">*</span>
        </label>
        <div class="tw:flex tw:gap-3">
          <label class="tw:flex tw:items-center tw:gap-2">
            <input v-model="outcome" type="radio" value="EFFECTIVE" class="tw:rounded-full" />
            <span class="tw:text-sm">Effective</span>
          </label>
          <label class="tw:flex tw:items-center tw:gap-2">
            <input v-model="outcome" type="radio" value="NOT_EFFECTIVE" class="tw:rounded-full" />
            <span class="tw:text-sm">Not Effective</span>
          </label>
        </div>
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Verification Notes <span class="tw:text-red-500">*</span>
        </label>
        <BaseTextarea
          v-model="comments"
          placeholder="What did you verify? Any residual risks?"
          :rows="4"
        />
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="isOpen = false">
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!outcome || !comments?.trim() || saving"
          @click="handleSubmit"
        >
          {{ saving ? 'Completing…' : 'Mark Complete' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>

  <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="handleEsignVerified" />
</template>
