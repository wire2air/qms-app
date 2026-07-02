<script setup>
// Shown mid-login when the account must set a new password first (first login
// or expiry). Completes via POST /v1/auth/password/change-required using the
// short-lived pending token from /login. On success the server either redirects
// (session established) or returns an MFA challenge, which we hand back up.
import { IconLock, IconArrowLeft } from '@tabler/icons-vue'
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter.vue'

const props = defineProps({
  pendingToken: { type: String, required: true },
  email: { type: String, default: '' },
  reason: { type: String, default: 'FIRST_LOGIN' }, // FIRST_LOGIN | EXPIRED
})

const emit = defineEmits(['mfa', 'cancel'])

const toast = useToast()

const newPassword = ref('')
const confirmPassword = ref('')
const meetsPolicy = ref(false)
const loading = ref(false)
const errorMsg = ref('')

const canSubmit = computed(
  () => meetsPolicy.value && newPassword.value && newPassword.value === confirmPassword.value,
)

const heading = computed(() =>
  props.reason === 'EXPIRED' ? 'Your password has expired' : 'Set a new password',
)
const subheading = computed(() =>
  props.reason === 'EXPIRED'
    ? 'For security, please choose a new password to continue.'
    : 'Before you continue, please choose a new password for your account.',
)

async function submit() {
  if (loading.value) return
  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = 'Passwords do not match'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const response = await fetch('/api/v1/auth/password/change-required', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken: props.pendingToken, newPassword: newPassword.value }),
    })

    if (response.ok) {
      if (response.redirected) {
        window.location.href = response.url
        return
      }
      const data = await response.json().catch(() => null)
      if (data?.mfaRequired) {
        emit('mfa', {
          pendingToken: data.pendingToken,
          availableFactors: data.availableFactors || ['totp'],
        })
        return
      }
      window.location.reload()
      return
    }

    const data = await response.json().catch(() => null)
    if (data?.error?.code === 'PENDING_EXPIRED') {
      toast.error(data.error.message || 'Please sign in again.')
      emit('cancel')
      return
    }
    // Policy failures (422) come back with the first issue as the message.
    errorMsg.value = data?.error?.message || 'Could not update your password. Try another.'
  } catch {
    errorMsg.value = 'Network error. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="tw:w-full tw:max-w-105">
    <div class="tw:pb-4">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">{{ heading }}</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">{{ subheading }}</div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseTextInput
          v-model="newPassword"
          type="password"
          placeholder="New password"
          autocomplete="new-password"
          :disabled="loading"
        >
          <template #icon>
            <IconLock :size="16" class="tw:text-secondary" />
          </template>
        </BaseTextInput>
        <PasswordStrengthMeter
          v-model="newPassword"
          :userInputs="[email]"
          @update:valid="meetsPolicy = $event"
        />
      </div>

      <BaseTextInput
        v-model="confirmPassword"
        type="password"
        placeholder="Confirm new password"
        autocomplete="new-password"
        :disabled="loading"
        :errorMsg="
          confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : errorMsg
        "
        @keyup.enter="submit"
      >
        <template #icon>
          <IconLock :size="16" class="tw:text-secondary" />
        </template>
      </BaseTextInput>

      <button
        class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
        :disabled="loading || !canSubmit"
        @click="submit"
      >
        <span v-if="loading" class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2">
          <BaseSpinner size="sm" color="white" />
          Updating…
        </span>
        <span v-else>Set password &amp; continue</span>
      </button>

      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-secondary tw:hover:text-on-main"
        @click="emit('cancel')"
      >
        <IconArrowLeft :size="16" />
        Back to sign in
      </button>
    </div>
  </div>
</template>
