<script setup>
// Step-up re-authentication prompt. Collects the operator's password and
// refreshes their step-up marker, then emits `verified` so the caller can retry
// the privileged action. Opened by useStepUp() on a 403 STEP_UP_REQUIRED.
import { IconShieldLock } from '@tabler/icons-vue'
import { platformStepUp } from '@/api/platform.js'

const emit = defineEmits(['verified'])
const show = defineModel({ type: Boolean, default: false })

const password = ref('')
const passwordError = ref('')
const busy = ref(false)

watch(show, (v) => {
  if (v) {
    password.value = ''
    busy.value = false
  }
})

async function submit() {
  if (!password.value) {
    passwordError.value = 'Password is required'
    return
  }
  busy.value = true
  try {
    await platformStepUp({ password: password.value })
    emit('verified')
  } catch {
    // The API layer already surfaced the error (e.g. "Invalid password").
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Confirm it's you">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-start tw:gap-2 tw:text-sm tw:text-secondary">
        <IconShieldLock :size="18" class="tw:mt-0.5 tw:shrink-0" />
        <p>This is a privileged action. Re-enter your password to continue.</p>
      </div>
      <BaseTextInput
        v-model="password"
        type="password"
        label="Password"
        :required="true"
        @keyup.enter="submit"
        @input="passwordError = ''"
      />
      <p v-if="passwordError" class="tw:text-xs tw:text-bad">{{ passwordError }}</p>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="secondary" :disabled="busy" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="busy || !password" @click="submit">
        {{ busy ? 'Verifying…' : 'Confirm' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
