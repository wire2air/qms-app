<script setup>
/**
 * E-signature verification — uniform PIN.
 *
 * The signer re-enters a dedicated e-sign PIN (separate from the login password
 * and independent of login method). Authenticated session = the Part 11 "ID"
 * component; the PIN = the "password" component. No OAuth/popups/origins — a
 * plain authenticated request on the current host, so it works identically on
 * every tenant subdomain.
 *
 * Emits `verified` with { method:'PIN', token } — the same shape consumers
 * already forward; the backend verifies it against users.esign_pin_hash.
 */
import { IconCircleCheck, IconLock, IconAlertTriangle } from '@tabler/icons-vue'
import { get } from '@/api'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const emit = defineEmits(['verified'])
const show = defineModel({ type: Boolean, default: false })

const checking = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const hasPin = ref(null)
const mode = ref('enter') // 'enter' | 'set' | 'change' | 'sent'

const pin = ref('')
const confirmPin = ref('')
const currentPin = ref('')

const userEmail = computed(() => currentSession.value?.email || '')
const userName = computed(() => {
  const s = currentSession.value
  if (!s) return ''
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
})

function resetFields() {
  pin.value = ''
  confirmPin.value = ''
  currentPin.value = ''
  errorMessage.value = ''
}

watch(show, async (val) => {
  if (!val) return
  resetFields()
  hasPin.value = null
  await fetchStatus()
  mode.value = hasPin.value ? 'enter' : 'set'
})

async function fetchStatus() {
  checking.value = true
  try {
    const data = await get('/v1/services/verify-identity', { showError: false })
    hasPin.value = !!data.hasPin
  } catch {
    hasPin.value = false
  } finally {
    checking.value = false
  }
}

// Enter PIN → sign.
function signWithPin() {
  if (!pin.value) {
    errorMessage.value = 'Please enter your e-signature PIN.'
    return
  }
  emit('verified', { method: 'PIN', token: pin.value })
  show.value = false
}

// First-time set → then sign with the same PIN.
async function setAndSign() {
  if (pin.value.length < 4) {
    errorMessage.value = 'PIN must be at least 4 characters.'
    return
  }
  if (pin.value !== confirmPin.value) {
    errorMessage.value = 'PINs do not match.'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    await post('/v1/services/esign-pin/set', { pin: pin.value })
    emit('verified', { method: 'PIN', token: pin.value })
    show.value = false
  } catch (e) {
    errorMessage.value = e?.message || 'Could not set PIN. Please try again.'
  } finally {
    submitting.value = false
  }
}

// Change PIN → back to enter mode.
async function changePin() {
  if (pin.value.length < 4) {
    errorMessage.value = 'New PIN must be at least 4 characters.'
    return
  }
  if (pin.value !== confirmPin.value) {
    errorMessage.value = 'New PINs do not match.'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    await post('/v1/services/esign-pin/change', { currentPin: currentPin.value, newPin: pin.value })
    resetFields()
    mode.value = 'enter'
  } catch (e) {
    errorMessage.value = e?.message || 'Could not change PIN. Please try again.'
  } finally {
    submitting.value = false
  }
}

// Forgot PIN → email a one-time reset link to the signed-in user.
async function requestReset() {
  submitting.value = true
  errorMessage.value = ''
  try {
    await post('/v1/services/esign-pin/reset-request', {})
    mode.value = 'sent'
  } catch (e) {
    errorMessage.value = e?.message || 'Could not send the reset email. Please try again.'
  } finally {
    submitting.value = false
  }
}

function goToChange() {
  resetFields()
  mode.value = 'change'
}
function backToEnter() {
  resetFields()
  mode.value = 'enter'
}
</script>

<template>
  <BaseDialog v-model="show" title="Sign with your PIN" maxWidth="md" persistent>
    <div v-if="checking" class="tw:flex tw:justify-center tw:py-8">
      <BaseSpinner size="md" />
    </div>

    <template v-else>
      <!-- Signer -->
      <div class="tw:mb-5">
        <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
          <div class="tw:size-10 tw:rounded-full tw:bg-primary tw:flex tw:items-center tw:justify-center tw:text-white">
            <IconCircleCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ userName }}</div>
            <div class="tw:text-xs tw:text-secondary">{{ userEmail }}</div>
          </div>
        </div>
        <p class="tw:text-xs tw:text-secondary tw:mt-2">
          <template v-if="mode === 'set'">
            Set your e-signature PIN. You'll re-enter it each time you sign — it's separate from your
            login password.
          </template>
          <template v-else-if="mode === 'change'">
            Change your e-signature PIN. You'll need your current PIN.
          </template>
          <template v-else>
            Enter your e-signature PIN to sign. This is required for e-signature compliance.
          </template>
        </p>
      </div>

      <div
        v-if="errorMessage"
        class="tw:flex tw:items-center tw:gap-2 tw:bg-red-50 tw:text-red-700 tw:rounded-lg tw:mb-4 tw:text-xs tw:px-3 tw:py-2"
      >
        <IconAlertTriangle :size="16" class="tw:text-red-500 tw:shrink-0" />
        {{ errorMessage }}
      </div>

      <!-- Enter PIN -->
      <div v-if="mode === 'enter'" class="tw:flex tw:flex-col tw:gap-3">
        <BaseTextInput
          v-model="pin"
          type="password"
          placeholder="Enter your e-signature PIN"
          autocomplete="off"
          @keyup.enter="signWithPin"
        >
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseButton class="tw:w-full" :isLoading="submitting" :disabled="!pin" @click="signWithPin">
          Sign
        </BaseButton>
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-4">
          <button
            type="button"
            class="tw:text-xs tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="goToChange"
          >
            Change PIN
          </button>
          <span class="tw:text-secondary tw:text-xs">·</span>
          <button
            type="button"
            class="tw:text-xs tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
            :disabled="submitting"
            @click="requestReset"
          >
            Forgot PIN?
          </button>
        </div>
      </div>

      <!-- Reset link sent -->
      <div v-else-if="mode === 'sent'" class="tw:flex tw:flex-col tw:gap-3 tw:text-center">
        <div class="tw:flex tw:justify-center">
          <div class="tw:size-12 tw:rounded-full tw:bg-green-100 tw:flex tw:items-center tw:justify-center tw:text-green-600">
            <IconCircleCheck :size="26" />
          </div>
        </div>
        <p class="tw:text-sm tw:text-on-main tw:font-medium">Check your email</p>
        <p class="tw:text-xs tw:text-secondary">
          We sent a reset link to <span class="tw:font-medium">{{ userEmail }}</span>. Open it to set
          a new e-signature PIN, then come back and sign.
        </p>
      </div>

      <!-- Set PIN (first time) -->
      <div v-else-if="mode === 'set'" class="tw:flex tw:flex-col tw:gap-3">
        <BaseTextInput v-model="pin" type="password" placeholder="New PIN (min 4 characters)" autocomplete="off">
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseTextInput
          v-model="confirmPin"
          type="password"
          placeholder="Confirm PIN"
          autocomplete="off"
          @keyup.enter="setAndSign"
        >
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseButton class="tw:w-full" :isLoading="submitting" :disabled="!pin || !confirmPin" @click="setAndSign">
          Set PIN &amp; Sign
        </BaseButton>
      </div>

      <!-- Change PIN -->
      <div v-else class="tw:flex tw:flex-col tw:gap-3">
        <BaseTextInput v-model="currentPin" type="password" placeholder="Current PIN" autocomplete="off">
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseTextInput v-model="pin" type="password" placeholder="New PIN (min 4 characters)" autocomplete="off">
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseTextInput
          v-model="confirmPin"
          type="password"
          placeholder="Confirm new PIN"
          autocomplete="off"
          @keyup.enter="changePin"
        >
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
        <BaseButton
          class="tw:w-full"
          :isLoading="submitting"
          :disabled="!currentPin || !pin || !confirmPin"
          @click="changePin"
        >
          Change PIN
        </BaseButton>
        <button
          type="button"
          class="tw:text-xs tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-center"
          @click="backToEnter"
        >
          Back
        </button>
      </div>
    </template>

    <template #footer>
      <BaseButton variant="outline" :disabled="submitting" @click="show = false">Cancel</BaseButton>
    </template>
  </BaseDialog>
</template>
