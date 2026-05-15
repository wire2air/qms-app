<script setup>
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  capaId: { type: String, required: true },
})

const emit = defineEmits(['scheduled'])
const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()
const dueAt = ref(null)
const saving = ref(false)

watch(isOpen, (open) => {
  if (open) {
    // Default to 30 days from now — common cadence for effectiveness checks.
    dueAt.value = DateTime.now().plus({ days: 30 })
  } else {
    dueAt.value = null
  }
})

async function handleSubmit() {
  if (!dueAt.value) {
    toast.notify({ type: 'negative', message: 'Due date is required' })
    return
  }
  saving.value = true
  try {
    const response = await post(`/v1/services/capas/${props.capaId}/effectivenessChecks`, {
      dueAt: dueAt.value.toISO(),
    })
    toast.success('Effectiveness check scheduled')
    isOpen.value = false
    emit('scheduled', response.effectivenessCheck)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to schedule' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Schedule Effectiveness Check" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Pick the date the CAPA owner should be reminded to verify the corrective and preventive
        actions are still effective.
      </p>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Due date <span class="tw:text-red-500">*</span>
        </label>
        <BaseDatePicker v-model="dueAt" />
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="isOpen = false">
          Cancel
        </BaseButton>
        <BaseButton variant="primary" :disabled="!dueAt || saving" @click="handleSubmit">
          {{ saving ? 'Scheduling…' : 'Schedule' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
