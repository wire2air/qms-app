<script setup>
import { IconMail, IconMailCheck } from '@tabler/icons-vue'
import { useAuth } from '@/composables/useAuth.js'
import { required } from '@shared/components/form/validators.js'

const router = useRouter()
const toast = useToast()
const { requestPasswordReset, loading } = useAuth()

const email = ref('')
const submitted = ref(false)
const emailFormatError = ref('')
const formRef = ref(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSubmit() {
  emailFormatError.value = ''

  if (!EMAIL_RE.test(email.value)) {
    emailFormatError.value = 'Please enter a valid email address.'
    return
  }

  try {
    await requestPasswordReset(email.value)
    submitted.value = true
  } catch (err) {
    toast.error(err?.message || 'Failed to send reset link. Please try again.')
  }
}

function goToLogin() {
  router.push('/signin')
}
</script>

<template>
  <div v-if="!submitted" class="tw:w-full tw:max-w-105">
    <div class="tw:pb-1">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">Reset your password</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">
        Enter your email address and we'll send you a link to reset your password.
      </div>
    </div>

    <div class="tw:pt-4">
      <BaseForm ref="formRef" hideFooter @submit="handleSubmit">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseField
            label="Email"
            required
            :value="email"
            :rules="[required()]"
            :error="emailFormatError"
          >
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="email"
                type="email"
                placeholder="Email"
                autocomplete="email"
                :disabled="loading"
                @keyup.enter="formRef?.submit()"
              >
                <template #icon>
                  <IconMail :size="16" class="tw:text-secondary" />
                </template>
              </BaseTextInput>
            </template>
          </BaseField>

          <button
            class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
            :disabled="loading || !email"
            @click="formRef?.submit()"
          >
            <span v-if="loading" class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2">
              <BaseSpinner size="sm" color="white" />
              Sending...
            </span>
            <span v-else>Send reset link</span>
          </button>

          <div class="tw:text-center">
            <a href="#" class="tw:text-sm tw:text-primary" @click.prevent="goToLogin">
              Back to sign in
            </a>
          </div>
        </div>
      </BaseForm>
    </div>
  </div>

  <!-- Success message -->
  <div v-else class="tw:w-full tw:max-w-105 tw:text-center tw:py-8">
    <div class="tw:mb-4 tw:flex tw:justify-center">
      <IconMailCheck :size="64" class="tw:text-green-600" />
    </div>
    <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mb-2">Check your email</div>
    <div class="tw:text-sm tw:text-secondary tw:mb-6">
      If an account exists for {{ email }}, you will receive a password reset link shortly.
    </div>
    <button
      class="tw:py-3 tw:px-8 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0"
      @click="goToLogin"
    >
      Back to sign in
    </button>
  </div>
</template>
