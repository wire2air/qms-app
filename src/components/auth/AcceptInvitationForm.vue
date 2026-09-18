<script setup>
import { IconAlertCircle, IconConfetti, IconLock } from '@tabler/icons-vue'
import { useAuth } from '@/composables/useAuth.js'
import { currentSubdomain, tenantOrigin } from '@/utils/tenant'
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { validateInvitation, acceptInvitation, loading } = useAuth()

const password = ref('')
const confirmPassword = ref('')
const token = ref('')
const firstName = ref('')
const lastName = ref('')
const email = ref('')
const companyCode = ref(null)
const tokenValid = ref(false)
const validating = ref(true)

// Password requirements popover — anchored to the field while focused. The
// meter's `valid` (server-checked policy, client-checklist fallback) gates the
// submit so the invite can't be accepted with a password the backend rejects.
const passwordFocused = ref(false)
const passwordValid = ref(false)

onMounted(async () => {
  token.value = route.query.token || ''
  if (!token.value) {
    toast.error('Invalid or missing invitation token')
    router.push('/signin')
    return
  }

  // Validate the token and get user info for the welcome message
  try {
    const data = await validateInvitation(token.value)
    if (data) {
      firstName.value = data.firstName
      lastName.value = data.lastName
      email.value = data.email
      companyCode.value = data.companyCode || null
      tokenValid.value = true
    } else {
      tokenValid.value = false
    }
  } catch {
    tokenValid.value = false
  }
  validating.value = false
})

function validatePasswordValue(passwordValue) {
  if (!passwordValue) {
    return 'Password is required'
  }
  if (!passwordValid.value) {
    return "Password doesn't meet the requirements"
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
  const passwordError = validatePasswordValue(password.value)
  if (passwordError) {
    toast.error(passwordError)
    return
  }

  const confirmPasswordError = validateConfirmPassword(confirmPassword.value)
  if (confirmPasswordError) {
    toast.error(confirmPasswordError)
    return
  }

  const result = await acceptInvitation(token.value, password.value)
  if (result) {
    toast.success('Welcome! Your account is now active.')

    setTimeout(goToLogin, 1000)
  }
}

// Send the user to their tenant's own sign-in. If we already know the company
// and we're not on its host (e.g. an older apex invite link), do a full
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
  <div class="tw:w-full tw:max-w-sm">
    <!-- Loading state -->
    <div v-if="validating" class="tw:text-center tw:py-12">
      <BaseSpinner size="lg" class="tw:mx-auto" />
      <div class="tw:text-secondary tw:mt-4">Validating invitation...</div>
    </div>

    <!-- Invalid token state -->
    <div v-else-if="!tokenValid" class="tw:text-center tw:py-8">
      <div class="tw:flex tw:justify-center tw:mb-4">
        <IconAlertCircle :size="48" class="tw:text-red-500" />
      </div>
      <div class="tw:text-xl tw:font-bold tw:text-on-main tw:mt-4">Invitation Expired</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-2">
        This invitation link is invalid or has expired. Please contact your administrator to receive
        a new invitation.
      </div>
      <button
        class="tw:w-full tw:mt-6 tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0"
        @click="goToLogin"
      >
        Go to Sign In
      </button>
    </div>

    <!-- Valid invitation form -->
    <template v-else>
      <div class="tw:pb-1">
        <div class="tw:text-center tw:mb-2 tw:flex tw:justify-center">
          <IconConfetti :size="40" class="tw:text-primary" />
        </div>
        <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:text-center">
          Welcome, {{ firstName }}!
        </div>
        <div class="tw:text-sm tw:text-secondary tw:mt-2 tw:text-center">
          Set your password to activate your account and get started.
        </div>
      </div>

      <div class="tw:pt-4">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:text-sm tw:text-secondary">
            <span class="tw:font-medium tw:text-on-main">Email:</span> {{ email }}
          </div>

          <div class="tw:relative">
            <BaseTextInput
              v-model="password"
              type="password"
              placeholder="Set new password"
              autocomplete="new-password"
              :disabled="loading"
              @focus="passwordFocused = true"
              @blur="passwordFocused = false"
              @keyup.enter="handleSubmit"
            >
              <template #icon>
                <IconLock :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>

            <!-- Requirements popover — floats under the field while focused.
                 pointer-events-none so clicks pass through to the confirm
                 field beneath instead of being spent dismissing it. -->
            <Transition
              enterActiveClass="tw:transition tw:duration-150 tw:ease-out"
              enterFromClass="tw:-translate-y-1 tw:opacity-0"
              enterToClass="tw:translate-y-0 tw:opacity-100"
              leaveActiveClass="tw:transition tw:duration-100 tw:ease-in"
              leaveFromClass="tw:translate-y-0 tw:opacity-100"
              leaveToClass="tw:-translate-y-1 tw:opacity-0"
            >
              <div
                v-show="passwordFocused"
                class="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:top-full tw:z-20 tw:mt-2 tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-3 tw:shadow-floating"
              >
                <p class="tw:mb-2 tw:text-xs tw:font-medium tw:text-secondary">
                  Your password must have:
                </p>
                <PasswordStrengthMeter
                  v-model="password"
                  :userInputs="[email, firstName, lastName]"
                  showEmpty
                  @update:valid="passwordValid = $event"
                />
              </div>
            </Transition>
          </div>

          <BaseTextInput
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm new password"
            autocomplete="new-password"
            :disabled="loading"
            :errorMsg="
              confirmPassword.length > 0 && password !== confirmPassword
                ? 'Passwords do not match'
                : ''
            "
            @keyup.enter="handleSubmit"
          >
            <template #icon>
              <IconLock :size="16" class="tw:text-secondary" />
            </template>
          </BaseTextInput>

          <button
            class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
            :disabled="loading || !passwordValid || !confirmPassword || password !== confirmPassword"
            @click="handleSubmit"
          >
            <span v-if="loading" class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2">
              <BaseSpinner size="sm" color="white" />
              Accepting...
            </span>
            <span v-else>Accept Invitation</span>
          </button>

          <div class="tw:text-center">
            <a
              href="#"
              class="tw:text-sm tw:text-primary tw:no-underline"
              @click.prevent="goToLogin"
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
