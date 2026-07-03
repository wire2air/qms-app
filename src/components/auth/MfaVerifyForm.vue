<script setup>
// Second-factor challenge shown after a correct password when the account has
// MFA enrolled. Drives POST /v1/auth/mfa/verify with a short-lived pendingToken
// (issued by /v1/auth/login). On success the backend establishes the session and
// responds with a redirect (the tenant handoff), exactly like a password login —
// so we follow it with window.location, mirroring LoginForm's flow.
import { IconDeviceMobile, IconMail, IconKey, IconArrowLeft } from '@tabler/icons-vue'

const props = defineProps({
  pendingToken: { type: String, required: true },
  availableFactors: { type: Array, default: () => ['totp'] },
  email: { type: String, default: '' },
})

const emit = defineEmits(['cancel'])

const toast = useToast()

// Which methods the server said this account can use, in a stable display order.
const METHOD_ORDER = ['totp', 'email_otp', 'recovery_code']
const methods = computed(() =>
  METHOD_ORDER.filter((m) => props.availableFactors.includes(m)),
)

const METHOD_META = {
  totp: { label: 'Authenticator app', icon: IconDeviceMobile, hint: 'Enter the 6-digit code from your authenticator app.' },
  email_otp: { label: 'Email code', icon: IconMail, hint: 'We\'ll email a 6-digit code to your address.' },
  recovery_code: { label: 'Recovery code', icon: IconKey, hint: 'Enter one of your saved backup codes.' },
}

const method = ref(methods.value[0] || 'totp')
const code = ref('')
const loading = ref(false)
const errorMsg = ref('')
const emailSent = ref(false)
const emailSending = ref(false)
const resendIn = ref(0)
let resendTimer = null

const isNumeric = computed(() => method.value === 'totp' || method.value === 'email_otp')

function selectMethod(m) {
  if (m === method.value) return
  method.value = m
  code.value = ''
  errorMsg.value = ''
}

function startResendCountdown() {
  resendIn.value = 30
  clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0) clearInterval(resendTimer)
  }, 1000)
}

onBeforeUnmount(() => clearInterval(resendTimer))

async function sendEmailCode() {
  if (emailSending.value || resendIn.value > 0) return
  emailSending.value = true
  errorMsg.value = ''
  try {
    // The verify/send routes are public and return a redirect on success, so we
    // hit them directly with fetch rather than the axios wrapper.
    await fetch('/api/v1/auth/mfa/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken: props.pendingToken }),
    })
    emailSent.value = true
    startResendCountdown()
    toast.info('If your account is valid, a code is on its way.')
  } catch {
    toast.error('Could not send the code. Please try again.')
  } finally {
    emailSending.value = false
  }
}

async function submit() {
  if (loading.value || !code.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const response = await fetch('/api/v1/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingToken: props.pendingToken,
        method: method.value,
        code: code.value.trim(),
      }),
    })

    if (response.ok) {
      if (response.redirected) {
        window.location.href = response.url
        return
      }
      // No redirect but OK — reload to let the session bootstrap resolve landing.
      window.location.reload()
      return
    }

    const data = await response.json().catch(() => null)
    const errCode = data?.error?.code
    if (errCode === 'PENDING_EXPIRED' || errCode === 'TOO_MANY_ATTEMPTS') {
      toast.error(data?.error?.message || 'Please sign in again.')
      emit('cancel')
      return
    }
    errorMsg.value = data?.error?.message || 'That code is incorrect. Try again.'
    code.value = ''
  } catch {
    errorMsg.value = 'Network error. Please try again.'
  } finally {
    loading.value = false
  }
}

// Auto-submit once a 6-digit numeric code is fully entered.
watch(code, (val) => {
  if (isNumeric.value && val.length === 6 && !loading.value) submit()
})
</script>

<template>
  <div class="tw:w-full tw:max-w-105">
    <div class="tw:pb-4">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">Two-factor verification</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">
        {{ METHOD_META[method]?.hint }}
      </div>
    </div>

    <!-- Method tabs (only when more than one is available) -->
    <div v-if="methods.length > 1" class="tw:flex tw:gap-2 tw:mb-4">
      <button
        v-for="m in methods"
        :key="m"
        type="button"
        class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:transition-colors"
        :class="
          m === method
            ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
            : 'tw:border-divider tw:text-secondary tw:hover:bg-main-hover'
        "
        @click="selectMethod(m)"
      >
        <component :is="METHOD_META[m]?.icon" :size="16" />
        {{ METHOD_META[m]?.label }}
      </button>
    </div>

    <!-- Email OTP: send/resend control -->
    <div v-if="method === 'email_otp' && !emailSent" class="tw:mb-4">
      <BaseButton variant="primary" :isLoading="emailSending" class="tw:w-full" @click="sendEmailCode">
        Email me a code
      </BaseButton>
    </div>

    <!-- Code entry -->
    <div v-if="method !== 'email_otp' || emailSent" class="tw:flex tw:flex-col tw:gap-3">
      <BaseOtpInput
        v-if="isNumeric"
        v-model="code"
        :length="6"
        charset="numeric"
        :errorMsg="errorMsg"
      />
      <BaseTextInput
        v-else
        v-model="code"
        placeholder="xxxx-xxxx-xxxx"
        autocomplete="one-time-code"
        :errorMsg="errorMsg"
        @keyup.enter="submit"
      />

      <BaseButton
        variant="primary"
        :isLoading="loading"
        :disabled="!code"
        class="tw:w-full"
        @click="submit"
      >
        Verify &amp; continue
      </BaseButton>

      <div v-if="method === 'email_otp'" class="tw:text-center tw:text-sm tw:text-secondary">
        <button
          type="button"
          class="tw:text-primary tw:disabled:text-secondary tw:disabled:cursor-not-allowed"
          :disabled="resendIn > 0 || emailSending"
          @click="sendEmailCode"
        >
          {{ resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code' }}
        </button>
      </div>
    </div>

    <div class="tw:pt-6">
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
