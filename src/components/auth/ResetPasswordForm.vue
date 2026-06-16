<script setup>
import { IconLock } from '@tabler/icons-vue'
import { useAuth } from '@/composables/useAuth.js'
import { currentSubdomain, tenantOrigin } from '@/utils/tenant'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirmPasswordReset, loading } = useAuth()

const password = ref('')
const confirmPassword = ref('')
const token = ref('')
const companyCode = ref(null)

// Get token from URL query parameter
onMounted(() => {
  token.value = route.query.token || ''
  if (!token.value) {
    toast.error('Invalid or missing reset token')
    router.push('/signin')
  }
})

function validatePassword(passwordValue) {
  if (!passwordValue) {
    return 'Password is required'
  }
  if (passwordValue.length < 8) {
    return 'Password must be at least 8 characters long'
  }
  return null
}

function validateConfirmPassword(confirmPasswordValue) {
  if (!confirmPasswordValue) {
    return 'Please confirm your password'
  }
  if (confirmPasswordValue !== password.value) {
    return 'Passwords do not match'
  }
  return null
}

async function handleSubmit() {
  // Validate password
  const passwordError = validatePassword(password.value)
  if (passwordError) {
    toast.error(passwordError)
    return
  }

  // Validate confirm password
  const confirmPasswordError = validateConfirmPassword(confirmPassword.value)
  if (confirmPasswordError) {
    toast.error(confirmPasswordError)
    return
  }

  const result = await confirmPasswordReset(token.value, password.value)
  if (!result) return

  companyCode.value = result.companyCode || null
  toast.success('Password updated successfully')

  // Redirect to the tenant's sign-in after a successful reset
  setTimeout(goToLogin, 1000)
}

// Send the user to their tenant's own sign-in. If we know the company and we're
// not already on its host (e.g. an older apex reset link), do a full
// cross-origin navigation to the subdomain; otherwise just route to /signin.
function goToLogin() {
  const code = companyCode.value
  if (code && code !== currentSubdomain()) {
    window.location.assign(`${tenantOrigin(code)}/signin`)
    return
  }
  router.push('/signin')
}
</script>

<template>
  <div class="tw:w-full tw:max-w-105">
    <div class="tw:pb-1">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">Set new password</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">Enter your new password below.</div>
    </div>

    <div class="tw:pt-4">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="password"
          type="password"
          placeholder="New password"
          autocomplete="new-password"
          :disabled="loading"
          @keyup.enter="handleSubmit"
        >
          <template #icon>
            <IconLock :size="16" class="tw:text-secondary" />
          </template>
        </BaseTextInput>

        <BaseTextInput
          v-model="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          autocomplete="new-password"
          :disabled="loading"
          @keyup.enter="handleSubmit"
        >
          <template #icon>
            <IconLock :size="16" class="tw:text-secondary" />
          </template>
        </BaseTextInput>

        <div class="tw:text-xs tw:text-secondary">Password must be at least 8 characters long</div>

        <button
          class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
          :disabled="loading || !password || !confirmPassword"
          @click="handleSubmit"
        >
          <span v-if="loading" class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2">
            <BaseSpinner size="sm" color="white" />
            Resetting...
          </span>
          <span v-else>Reset password</span>
        </button>

        <div class="tw:text-center">
          <a href="#" class="tw:text-sm tw:text-primary" @click.prevent="goToLogin">
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
