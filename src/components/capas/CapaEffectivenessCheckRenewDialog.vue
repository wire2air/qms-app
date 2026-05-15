<script setup>
import { post } from '@/api'
import { DateTime } from 'luxon'

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

watch(isOpen, (open) => {
  if (open) {
    dueAt.value = DateTime.now().plus({ days: 30 })
    comments.value = ''
  } else {
    dueAt.value = null
  }
})

async function handleSubmit() {
  if (!props.checkId) return
  if (!dueAt.value) {
    toast.notify({ type: 'negative', message: 'New due date is required' })
    return
  }
  saving.value = true
  try {
    const response = await post(
      `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/renew`,
      { dueAt: dueAt.value.toISO(), comments: comments.value || null },
    )
    toast.success('Effectiveness check renewed')
    isOpen.value = false
    emit('renewed', response.effectivenessCheck)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to renew' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Renew Effectiveness Check" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Close out this check and schedule the next follow-up.
      </p>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Next due date <span class="tw:text-red-500">*</span>
        </label>
        <BaseDatePicker v-model="dueAt" />
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">Comments</label>
        <BaseTextarea
          v-model="comments"
          placeholder="What did you verify on this round?"
          :rows="3"
        />
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="isOpen = false">
          Cancel
        </BaseButton>
        <BaseButton variant="primary" :disabled="!dueAt || saving" @click="handleSubmit">
          {{ saving ? 'Renewing…' : 'Renew' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
