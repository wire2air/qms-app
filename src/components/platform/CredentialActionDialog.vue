<script setup>
// Reusable reason-capture dialog for platform credential support ops
// (password reset / unlock / MFA reset). Collects a mandatory reason and emits
// it; the parent performs the actual API call. Every op is audited server-side.

defineProps({
  title: { type: String, default: 'Confirm action' },
  description: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm'])
const show = defineModel({ type: Boolean, default: false })

const reason = ref('')
const reasonError = ref('')
const busy = ref(false)

watch(show, (open) => {
  if (open) {
    reason.value = ''
    busy.value = false
  }
})

async function confirm() {
  if (!reason.value.trim()) {
    reasonError.value = 'A reason is required'
    return
  }
  busy.value = true
  try {
    // Parent awaits its API call, then closes via v-model.
    await emit('confirm', reason.value.trim())
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="title">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <p v-if="description" class="tw:text-sm tw:text-secondary">{{ description }}</p>
      <BaseTextarea
        v-model="reason"
        label="Reason"
        :rows="2"
        :required="true"
        placeholder="e.g. Verified caller identity for support ticket #1234"
        @input="reasonError = ''"
      />
      <p v-if="reasonError" class="tw:text-xs tw:text-bad">{{ reasonError }}</p>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="secondary" :disabled="busy" @click="close">Cancel</BaseButton>
      <BaseButton :variant="danger ? 'danger' : 'primary'" :disabled="busy" @click="confirm">
        {{ busy ? 'Working…' : confirmLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
