<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { DateTime } from 'luxon'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  capaId: { type: String, required: true },
})

const emit = defineEmits(['scheduled'])
const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()
const dueAt = ref(null)
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)

watch(isOpen, (open) => {
  if (open) {
    // Default to 30 days from now — common cadence for effectiveness checks.
    dueAt.value = DateTime.now().plus({ days: 30 })
    saveError.value = ''
  } else {
    dueAt.value = null
  }
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const response = await post(`/v1/services/capas/${props.capaId}/effectivenessChecks`, {
      dueAt: dueAt.value.toISO(),
    })
    toast.success('Effectiveness check scheduled')
    isOpen.value = false
    emit('scheduled', response.effectivenessCheck)
  } catch (e) {
    saveError.value = e.message || 'Failed to schedule'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Schedule Effectiveness Check" maxWidth="md">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Pick the date the CAPA owner should be reminded to verify the corrective and preventive
          actions are still effective.
        </p>
        <BaseField label="Due date" required :value="dueAt" :rules="[required()]">
          <BaseDateField v-model="dueAt" mode="date" />
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Schedule"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>
</template>
