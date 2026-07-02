<script setup>
// Guided TOTP enrolment: fetch a secret + QR, confirm one live code, then force
// the user to save their recovery codes before finishing. All calls are action
// RPCs (secret-return / verb endpoints), so they use the axios wrapper directly.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import {
  IconQrcode,
  IconDeviceMobile,
  IconShieldLock,
  IconCopy,
  IconDownload,
  IconCheck,
} from '@tabler/icons-vue'

const emit = defineEmits(['complete', 'cancel'])

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

async function beginSetup() {
  preparing.value = true
  try {
    const data = await post('/v1/auth/mfa/totp/setup', {}, { loader: preparing, showError: true })
    otpauthUri.value = data.otpauthUri
    qrDataUrl.value = data.qrDataUrl
    secret.value = data.secret
  } catch {
    // If setup can't start (e.g. already enrolled, or server key missing),
    // close the wizard — the parent will re-read status and show the reason.
    emit('cancel')
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
    const data = await post(
      '/v1/auth/mfa/totp/activate',
      { code: code.value.trim() },
      { loader: verifying, showError: false },
    )
    recoveryCodes.value = data.recoveryCodes || []
    step.value = 2
  } catch (err) {
    verifyError.value = err?.message || 'That code is incorrect. Try again.'
    code.value = ''
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

function finish() {
  if (!acknowledged.value) return
  toast.success('Two-factor authentication is on')
  emit('complete')
}
</script>

<template>
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
        Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator,
        Authy, or 1Password). Then continue to enter the 6-digit code it generates.
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
      <div class="tw:flex tw:justify-between tw:gap-2">
        <BaseButton variant="text" @click="emit('cancel')">Cancel</BaseButton>
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
        <BaseButton variant="primary" :isLoading="verifying" :disabled="code.length < 6" @click="verify">
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
        <BaseButton variant="primary" :disabled="!acknowledged" @click="finish">
          <IconCheck :size="16" /> Finish
        </BaseButton>
      </div>
    </div>
  </div>
</template>
