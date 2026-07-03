<script setup>
// Shown mid-login when the org REQUIRES MFA, the person isn't enrolled, and
// their grace window has elapsed. Mirrors the authenticated MfaSetupWizard, but
// drives the pre-session /v1/auth/mfa/required/* endpoints with the short-lived
// pending-enrolment token from /login (no session exists yet). On finish it
// completes sign-in and follows the handoff redirect like a normal login.
import {
  IconQrcode,
  IconDeviceMobile,
  IconShieldLock,
  IconCopy,
  IconDownload,
  IconCheck,
  IconArrowLeft,
} from '@tabler/icons-vue'

const props = defineProps({
  pendingToken: { type: String, required: true },
  email: { type: String, default: '' },
})

// Emitted when the pending token is gone/expired — the parent returns to sign in.
const emit = defineEmits(['expired'])

const toast = useToast()

const STEPS = [
  { title: 'Scan', icon: IconQrcode },
  { title: 'Verify', icon: IconDeviceMobile },
  { title: 'Save codes', icon: IconShieldLock },
]
const step = ref(0)

const preparing = ref(true)
const otpauthUri = ref('')
const qrDataUrl = ref('')
const secret = ref('')

const code = ref('')
const verifying = ref(false)
const verifyError = ref('')

const recoveryCodes = ref([])
const acknowledged = ref(false)
const finishing = ref(false)

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

function handleExpired() {
  toast.error('Your login session expired. Please sign in again.')
  emit('expired')
}

async function beginSetup() {
  preparing.value = true
  try {
    const res = await postJson('/api/v1/auth/mfa/required/setup', {
      pendingToken: props.pendingToken,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (data?.error?.code === 'PENDING_EXPIRED') return handleExpired()
      toast.error(data?.error?.message || 'Unable to start MFA setup.')
      return
    }
    // Already has an active factor (rare) — skip straight to finishing sign-in.
    if (data?.alreadyEnrolled) return finish()
    otpauthUri.value = data.otpauthUri
    qrDataUrl.value = data.qrDataUrl
    secret.value = data.secret
  } catch {
    toast.error('Network error. Please try again.')
  } finally {
    preparing.value = false
  }
}

onMounted(beginSetup)

async function verify() {
  if (verifying.value || code.value.length < 6) return
  verifying.value = true
  verifyError.value = ''
  try {
    const res = await postJson('/api/v1/auth/mfa/required/activate', {
      pendingToken: props.pendingToken,
      code: code.value.trim(),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (data?.error?.code === 'PENDING_EXPIRED') return handleExpired()
      verifyError.value = data?.error?.message || 'That code is incorrect. Try again.'
      code.value = ''
      return
    }
    recoveryCodes.value = data.recoveryCodes || []
    step.value = 2
  } catch {
    verifyError.value = 'Network error. Please try again.'
  } finally {
    verifying.value = false
  }
}

watch(code, (val) => {
  if (val.length === 6 && !verifying.value) verify()
})

const recoveryText = computed(() => recoveryCodes.value.join('\n'))

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryText.value)
    toast.info('Recovery codes copied')
  } catch {
    toast.error('Could not copy — select and copy them manually')
  }
}

function downloadCodes() {
  const blob = new Blob(
    [`QMS recovery codes\nKeep these somewhere safe. Each code works once.\n\n${recoveryText.value}\n`],
    { type: 'text/plain' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'qms-recovery-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}

// Establish the session and follow the post-login handoff, exactly like a
// normal login completion.
async function finish() {
  if (finishing.value) return
  finishing.value = true
  try {
    const res = await postJson('/api/v1/auth/mfa/required/complete', {
      pendingToken: props.pendingToken,
    })
    if (res.redirected) {
      window.location.href = res.url
      return
    }
    if (res.ok) {
      // No redirect returned — fall back to the app root on the current host.
      window.location.assign('/')
      return
    }
    const data = await res.json().catch(() => null)
    if (data?.error?.code === 'PENDING_EXPIRED') return handleExpired()
    toast.error(data?.error?.message || 'Could not complete sign-in. Please try again.')
  } catch {
    toast.error('Network error. Please try again.')
  } finally {
    finishing.value = false
  }
}
</script>

<template>
  <div class="tw:w-full tw:max-w-105">
    <div class="tw:pb-4">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">Set up two-factor authentication</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">
        Your organization requires two-factor authentication. Set it up now to finish signing in.
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-6">
      <BaseStepper v-model="step" :steps="STEPS" ariaLabel="MFA setup progress" />

      <!-- Loading the secret/QR -->
      <div v-if="preparing" class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:py-10">
        <BaseSpinner size="md" />
        <span class="tw:text-sm tw:text-secondary">Preparing your authenticator…</span>
      </div>

      <!-- Step 1: Scan -->
      <div v-else-if="step === 0" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          Scan this QR code with an authenticator app (Google Authenticator, Microsoft
          Authenticator, Authy, or 1Password). Then continue to enter the 6-digit code it generates.
        </p>
        <div class="tw:flex tw:flex-col tw:items-center tw:gap-3">
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            alt="Authenticator QR code"
            class="tw:size-48 tw:rounded-lg tw:border tw:border-divider tw:bg-white tw:p-2"
          />
          <div class="tw:w-full">
            <p class="tw:text-caption tw:text-secondary tw:mb-1">Can't scan? Enter this key manually:</p>
            <code
              class="tw:block tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:px-3 tw:py-2 tw:text-center tw:text-sm tw:tracking-widest tw:break-all tw:text-on-main"
            >
              {{ secret }}
            </code>
          </div>
        </div>
        <div class="tw:flex tw:justify-end">
          <BaseButton variant="primary" @click="step = 1">Continue</BaseButton>
        </div>
      </div>

      <!-- Step 2: Verify -->
      <div v-else-if="step === 1" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          Enter the 6-digit code from your authenticator app to confirm it's set up correctly.
        </p>
        <div class="tw:flex tw:justify-center">
          <BaseOtpInput v-model="code" :length="6" charset="numeric" :errorMsg="verifyError" />
        </div>
        <div class="tw:flex tw:justify-between tw:gap-2">
          <BaseButton variant="text" @click="step = 0">Back</BaseButton>
          <BaseButton
            variant="primary"
            :isLoading="verifying"
            :disabled="code.length < 6"
            @click="verify"
          >
            Verify
          </BaseButton>
        </div>
      </div>

      <!-- Step 3: Recovery codes -->
      <div v-else class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:rounded-lg tw:border tw:border-warning/40 tw:bg-warning/10 tw:px-4 tw:py-3">
          <p class="tw:text-sm tw:font-medium tw:text-on-main">Save your recovery codes</p>
          <p class="tw:text-caption tw:text-secondary tw:mt-0.5">
            Each code works once. Use one if you ever lose access to your authenticator. This is the
            only time they're shown.
          </p>
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
          <code
            v-for="c in recoveryCodes"
            :key="c"
            class="tw:text-center tw:text-sm tw:tracking-wider tw:text-on-main"
          >
            {{ c }}
          </code>
        </div>

        <div class="tw:flex tw:gap-2">
          <BaseButton variant="outline" size="sm" @click="copyCodes">
            <IconCopy :size="16" /> Copy
          </BaseButton>
          <BaseButton variant="outline" size="sm" @click="downloadCodes">
            <IconDownload :size="16" /> Download
          </BaseButton>
        </div>

        <BaseCheckbox v-model="acknowledged" label="I've saved my recovery codes somewhere safe." />

        <div class="tw:flex tw:justify-end">
          <BaseButton
            variant="primary"
            :isLoading="finishing"
            :disabled="!acknowledged"
            @click="finish"
          >
            <IconCheck :size="16" /> Finish &amp; continue
          </BaseButton>
        </div>
      </div>

      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
        @click="emit('expired')"
      >
        <IconArrowLeft :size="16" />
        Back to sign in
      </button>
    </div>
  </div>
</template>
