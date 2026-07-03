<script setup>
import { IconShieldCheck, IconCircleCheck, IconLock } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

defineOptions({ name: 'ResetEsignPinPage' })

const router = useRouter()
const route = useRoute()
const toast = useToast()

const pin = ref('')
const confirmPin = ref('')
const token = ref('')
const loading = ref(false)
const done = ref(false)

onMounted(() => {
  token.value = route.query.token || ''
  if (!token.value) {
    toast.error('Invalid or missing reset link')
    router.push('/')
  }
})

async function handleSubmit() {
  if (!pin.value || pin.value.length < 4) {
    toast.error('PIN must be at least 4 characters')
    return
  }
  if (pin.value !== confirmPin.value) {
    toast.error('PINs do not match')
    return
  }
  loading.value = true
  try {
    await post(
      '/v1/services/esign-pin/reset',
      { token: token.value, newPin: pin.value },
      { showError: true },
    )
    done.value = true
    toast.success('E-signature PIN updated')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- Left side - Branding -->
      <div class="login-branding">
        <div class="branding-content">
          <IconShieldCheck :size="48" class="tw:text-white" />
          <h1 class="branding-title">QMS</h1>
          <p class="branding-subtitle">Quality Management System</p>
          <div class="branding-features">
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Document Control</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Audit Management</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Compliance Tracking</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side - Reset PIN Form -->
      <div class="login-form-section tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8">
        <div class="tw:w-full tw:max-w-105">
          <template v-if="done">
            <div class="tw:flex tw:flex-col tw:gap-3 tw:text-center">
              <div class="tw:flex tw:justify-center">
                <div
                  class="tw:size-12 tw:rounded-full tw:bg-green-100 tw:flex tw:items-center tw:justify-center tw:text-green-600"
                >
                  <IconCircleCheck :size="26" />
                </div>
              </div>
              <div class="tw:text-2xl tw:font-bold tw:text-on-main">E-signature PIN updated</div>
              <div class="tw:text-sm tw:text-secondary">
                You can now use your new PIN when signing. Return to the app and complete your
                signature.
              </div>
              <button
                class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 tw:mt-2"
                @click="router.push('/')"
              >
                Go to app
              </button>
            </div>
          </template>

          <template v-else>
            <div class="tw:pb-1">
              <div class="tw:text-2xl tw:font-bold tw:text-on-main">Set a new e-signature PIN</div>
              <div class="tw:text-sm tw:text-secondary tw:mt-1">
                This is the PIN you re-enter each time you sign — separate from your login password.
              </div>
            </div>

            <div class="tw:pt-4">
              <div class="tw:flex tw:flex-col tw:gap-4">
                <BaseTextInput
                  v-model="pin"
                  type="password"
                  placeholder="New PIN (min 4 characters)"
                  autocomplete="new-password"
                  :disabled="loading"
                  @keyup.enter="handleSubmit"
                >
                  <template #icon><IconLock :size="16" class="tw:text-secondary" /></template>
                </BaseTextInput>

                <BaseTextInput
                  v-model="confirmPin"
                  type="password"
                  placeholder="Confirm new PIN"
                  autocomplete="new-password"
                  :disabled="loading"
                  @keyup.enter="handleSubmit"
                >
                  <template #icon><IconLock :size="16" class="tw:text-secondary" /></template>
                </BaseTextInput>

                <div class="tw:text-xs tw:text-secondary">PIN must be at least 4 characters long</div>

                <button
                  class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
                  :disabled="loading || !pin || !confirmPin"
                  @click="handleSubmit"
                >
                  <span
                    v-if="loading"
                    class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2"
                  >
                    <BaseSpinner size="sm" color="white" />
                    Saving...
                  </span>
                  <span v-else>Set PIN</span>
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-6">
          © 2026 Quality Management System. All rights reserved.
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background-color: var(--main);
}

.login-container {
  display: flex;
  min-height: 100vh;
}

.login-branding {
  flex: 1;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: white;

  @media (max-width: 900px) {
    display: none;
  }
}

.branding-content {
  max-width: 400px;
}

.branding-title {
  font-size: 3rem;
  font-weight: 700;
  margin: 24px 0 8px;
  letter-spacing: -0.025em;
}

.branding-subtitle {
  font-size: 1.1rem;
  opacity: 0.9;
  margin-bottom: 48px;
}

.login-form-section {
  flex: 1;
  background-color: var(--sidebar);

  @media (max-width: 900px) {
    min-height: 100vh;
  }
}
</style>
