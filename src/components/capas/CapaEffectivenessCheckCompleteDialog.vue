<script setup>
import { post } from '@/api'

const props = defineProps({
  capaId: { type: String, required: true },
  checkId: { type: String, default: null },
})

const emit = defineEmits(['completed'])
const isOpen = defineModel({ type: Boolean, default: false })
const toast = useToast()
const comments = ref('')
const saving = ref(false)

watch(isOpen, (open) => {
  if (open) comments.value = ''
})

async function handleSubmit() {
  if (!props.checkId) return
  saving.value = true
  try {
    const response = await post(
      `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/complete`,
      { comments: comments.value || null },
    )
    toast.success('Effectiveness check completed')
    isOpen.value = false
    emit('completed', response.effectivenessCheck)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to complete' })
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
        from recurring. Add any verification notes below.
      </p>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">Comments</label>
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
        <BaseButton variant="primary" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Completing…' : 'Mark Complete' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
