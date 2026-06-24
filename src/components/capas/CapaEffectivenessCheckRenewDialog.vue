<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { DateTime } from 'luxon'
import { required } from '@shared/components/form/validators.js'
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
const saveError = ref('')
const formRef = ref(null)
const esignOpen = ref(false)
const esignData = ref(null)

watch(isOpen, (open) => {
  if (open) {
    dueAt.value = DateTime.now().plus({ days: 30 })
    comments.value = ''
    esignData.value = null
    saveError.value = ''
  } else {
    dueAt.value = null
  }
})

function handleEsignVerified(data) {
  esignData.value = data
  esignOpen.value = false
  doRenew()
}

async function doRenew() {
  if (!props.checkId) return
  saving.value = true
  saveError.value = ''
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
    saveError.value = e.message || 'Failed to renew'
    esignData.value = null
  } finally {
    saving.value = false
  }
}

async function onValidSubmit() {
  if (!props.checkId) return
  if (!esignData.value) {
    esignOpen.value = true
    return
  }
  await doRenew()
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Renew Effectiveness Check" maxWidth="md">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Close out this check and schedule the next follow-up. This requires e-signature
          verification.
        </p>
        <BaseField label="Next due date" required :value="dueAt" :rules="[required()]">
          <BaseDateField v-model="dueAt" mode="date" />
        </BaseField>
        <BaseField label="Comments" :value="comments">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="comments"
              placeholder="What did you verify on this round?"
              :rows="3"
            />
          </template>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Renew"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>

  <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="handleEsignVerified" />
</template>
