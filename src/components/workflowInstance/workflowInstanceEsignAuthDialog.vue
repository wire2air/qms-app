<script setup>
import { IconCircleCheck, IconLock, IconAlertTriangle } from '@tabler/icons-vue'
import { get } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { apexOrigin } from '@/utils/tenant'

const emit = defineEmits(['verified'])

const show = defineModel({ type: Boolean, default: false })

const loading = ref(false)
const checking = ref(false)
const oauthLoading = ref(false)
const password = ref('')
const hasPassword = ref(null)
const errorMessage = ref('')
const googleClientId = ref(null)
const microsoftClientId = ref(null)

const userEmail = computed(() => currentSession.value?.email || '')
const userName = computed(() => {
  const s = currentSession.value
  if (!s) return ''
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
})

watch(show, async (val) => {
  if (val) {
    password.value = ''
    errorMessage.value = ''
    hasPassword.value = null
    oauthLoading.value = false
    await fetchIdentityMethods()
  }
})

async function fetchIdentityMethods() {
  checking.value = true
  try {
    const data = await get('/v1/services/verify-identity', { showError: false })
    hasPassword.value = data.hasPassword
    googleClientId.value = data.googleClientId
    microsoftClientId.value = data.microsoftClientId
  } catch {
    hasPassword.value = false
  } finally {
    checking.value = false
  }
}

// ── OAuth via the apex bridge ───────────────────────────────────────────────
// Per-tenant subdomains can't run the provider SDKs (origins can't be
// wildcard-registered), so — exactly like login — we do the OAuth on the apex
// in a popup and the apex postMessages back a one-time proof token. The token
// goes out unchanged as { method:'OAUTH', provider, token }, so every consumer
// is untouched; the backend confirms the verified email is the signer's.
const OAUTH_ERRORS = {
  cancelled: 'Verification was cancelled.',
  invalid_state: 'Verification expired — please try again.',
  timeout: 'Verification timed out — please try again.',
  no_email: "Couldn't read your email from the provider.",
  verification_failed: 'Verification failed. Please try again.',
  no_pending: 'Verification session was lost — please try again.',
}

function verifyViaApex(strategy, provider) {
  oauthLoading.value = true
  errorMessage.value = ''

  const apex = apexOrigin()
  const url = `${apex}/api/v1/services/verify-identity/esign-oauth/${strategy}?origin=${encodeURIComponent(window.location.origin)}`
  const popup = window.open(url, 'qms-esign-verify', 'width=480,height=680')
  if (!popup) {
    oauthLoading.value = false
    errorMessage.value = 'Popup blocked. Allow popups for this site and try again.'
    return
  }

  function cleanup() {
    window.removeEventListener('message', onMessage)
    clearInterval(closeTimer)
  }
  function onMessage(e) {
    // Only trust messages from the apex origin (where the OAuth ran).
    if (e.origin !== apex) return
    const d = e.data
    if (!d || d.source !== 'qms-esign') return
    cleanup()
    oauthLoading.value = false
    if (d.ok && d.token) {
      emit('verified', { method: 'OAUTH', provider: d.provider || provider, token: d.token })
      show.value = false
    } else {
      errorMessage.value = OAUTH_ERRORS[d.error] || 'Verification failed. Please try again.'
    }
  }
  // If the user closes the popup without finishing, stop the spinner.
  const closeTimer = setInterval(() => {
    if (popup.closed) {
      cleanup()
      oauthLoading.value = false
    }
  }, 700)
  window.addEventListener('message', onMessage)
}

function verifyWithGoogle() {
  verifyViaApex('google', 'GOOGLE')
}
function verifyWithMicrosoft() {
  verifyViaApex('microsoft', 'MICROSOFT')
}

// ── Password ───────────────────────────────────────────────────────────────────
function verifyWithPassword() {
  if (!password.value) {
    errorMessage.value = 'Please enter your password'
    return
  }
  emit('verified', { method: 'PASSWORD', token: password.value })
}
</script>

<template>
  <BaseDialog v-model="show" title="Verify Your Identity" maxWidth="md" persistent>
    <!-- Loading state while fetching auth methods -->
    <div v-if="checking" class="tw:flex tw:justify-center tw:py-8">
      <div
        class="tw:size-8 tw:animate-spin tw:rounded-full tw:border-2 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <template v-else>
      <!-- Header info -->
      <div class="tw:mb-5">
        <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
          <div
            class="tw:size-10 tw:rounded-full tw:bg-primary tw:flex tw:items-center tw:justify-center tw:text-white"
          >
            <IconCircleCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ userName }}</div>
            <div class="tw:text-xs tw:text-secondary">{{ userEmail }}</div>
          </div>
        </div>
        <p class="tw:text-xs tw:text-secondary tw:mt-2">
          To proceed with this action, please confirm your identity by re-authenticating below. This
          is required for e-signature compliance.
        </p>
      </div>

      <!-- Error message -->
      <div
        v-if="errorMessage"
        class="tw:flex tw:items-center tw:gap-2 tw:bg-red-50 tw:text-red-700 tw:rounded-lg tw:mb-4 tw:text-xs tw:px-3 tw:py-2"
      >
        <IconAlertTriangle :size="16" class="tw:text-red-500 tw:shrink-0" />
        {{ errorMessage }}
      </div>

      <!-- OAuth buttons (shown when configured) -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <button
          v-if="googleClientId"
          :disabled="oauthLoading"
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3 tw:rounded-lg tw:text-sm tw:font-medium tw:bg-slate-100 tw:text-slate-800 tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          @click="verifyWithGoogle"
        >
          <svg class="tw:w-5 tw:h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Verify with Google</span>
        </button>

        <button
          v-if="microsoftClientId"
          :disabled="oauthLoading"
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3 tw:rounded-lg tw:text-sm tw:font-medium tw:bg-slate-100 tw:text-slate-800 tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          @click="verifyWithMicrosoft"
        >
          <svg class="tw:w-5 tw:h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="10" height="10" fill="#f25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
            <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
            <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
          </svg>
          <span>Verify with Microsoft</span>
        </button>

        <!-- Password section (only if user has a password) -->
        <template v-if="hasPassword">
          <div class="tw:flex tw:items-center tw:gap-4 tw:my-1">
            <div class="tw:flex-1 tw:h-px tw:bg-divider" />
            <span class="tw:text-xs tw:text-secondary">or enter your password</span>
            <div class="tw:flex-1 tw:h-px tw:bg-divider" />
          </div>

          <BaseTextInput
            v-model="password"
            type="password"
            placeholder="Enter your password"
            @keyup.enter="verifyWithPassword"
          >
            <template #icon>
              <IconLock :size="18" class="tw:text-secondary" />
            </template>
          </BaseTextInput>

          <BaseButton
            class="tw:w-full"
            :isLoading="loading"
            :disabled="!password"
            @click="verifyWithPassword"
          >
            Verify with Password
          </BaseButton>
        </template>
      </div>
    </template>

    <template #footer>
      <BaseButton variant="outline" :disabled="loading || oauthLoading" @click="show = false">
        Cancel
      </BaseButton>
    </template>
  </BaseDialog>
</template>
