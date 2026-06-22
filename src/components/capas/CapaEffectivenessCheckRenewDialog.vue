<script setup>
import { post } from '@/api'
import { DateTime } from 'luxon'
import workflowInstanceEsignAuthDialog from '@/components/workflowInstance/workflowInstanceEsignAuthDialog.vue'

const props = defineProps({
  capaId: { type: String, required: true },
  checkId: { type: String, default: null },
})

const emit = defineEmits(['renewed'])
const isOpen = defineModel({ type: Boolean, default: false })
const toast = useToast()
const dueAt = ref(null)
const comments = ref('')
const saving = ref(false)
const esignOpen = ref(false)
const esignData = ref(null)

watch(isOpen, (open) => {
  if (open) {
    dueAt.value = DateTime.now().plus({ days: 30 })
    comments.value = ''
    esignData.value = null
  } else {
    dueAt.value = null
  }
})

function handleEsignVerified(data) {
  esignData.value = data
  esignOpen.value = false
  handleSubmit()
}

async function handleSubmit() {
  if (!props.checkId) return
  if (!dueAt.value) {
    toast.notify({ type: 'negative', message: 'New due date is required' })
    return
  }
  if (!esignData.value) {
    esignOpen.value = true
    return
  }
  saving.value = true
  try {
    const response = await post(
      `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/renew`,
      {
        dueAt: dueAt.value.toISO(),
        comments: comments.value || null,
        method: esignData.value.method,
        token: esignData.value.token,
        provider: esignData.value.provider || null,
      },
    )
    toast.success('Effectiveness check renewed')
    isOpen.value = false
    emit('renewed', response.effectivenessCheck)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to renew' })
    esignData.value = null
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Renew Effectiveness Check" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Close out this check and schedule the next follow-up. This requires e-signature verification.
      </p>
      <BaseField label="Next due date" required>
        <BaseDateField v-model="dueAt" mode="date" />
      </BaseField>
      <BaseField v-slot="{ id: fieldId }" label="Comments">
        <BaseTextarea
          :id="fieldId"
          v-model="comments"
          placeholder="What did you verify on this round?"
          :rows="3"
        />
      </BaseField>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Renew"
        :loading="saving"
        :disabled="!dueAt"
        @cancel="isOpen = false"
        @submit="handleSubmit"
      />
    </template>
  </BaseDialog>

  <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="handleEsignVerified" />
</template>
