<script setup>
import { IconUser, IconMail, IconLock, IconBuilding, IconArrowLeft } from '@tabler/icons-vue'
import { currentSubdomain, rootDomain, apexOrigin } from '@/utils/tenant'

const props = defineProps({
  mode: {
    type: String,
    default: 'signin',
    validator: (value) => ['signin', 'signup'].includes(value),
  },
})

const emit = defineEmits(['authenticated'])

const toast = useToast()

const loadingGoogle = ref(false)
const loadingMicrosoft = ref(false)
const loadingLogin = ref(false)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const firstName = ref('')
const lastName = ref('')

const isSignup = computed(() => props.mode === 'signup')

// The tenant whose /signin we're on (acme.qability.com → "acme"), or null on the
// apex host. When set, the form offers a way back to the workspace picker so a
// user who landed on the wrong workspace isn't stranded (they'd otherwise have
// to hand-edit the URL).
const workspace = computed(() => currentSubdomain())
const domainSuffix = computed(() => `.${rootDomain()}`)

function goToWorkspacePicker() {
  // Full cross-origin navigation to the apex host, where WorkspacePicker lives.
  window.location.assign(`${apexOrigin()}/signin`)
}

const isFormValid = computed(() => {
  if (!email.value || !password.value) return false
  if (isSignup.value) {
    return (
      firstName.value &&
      lastName.value &&
      confirmPassword.value &&
      password.value === confirmPassword.value &&
      password.value.length >= 8
    )
  }
  return true
})

// OAuth completes on the fixed callback host (not this tenant subdomain), so
// pass the current tenant as `redirectToCompany` — the backend threads it
// through OAuth state and, after the callback, hands off back to THIS tenant
// rather than the user's first company.
function federatedLoginUrl(strategy) {
  const sub = currentSubdomain()
  const query = sub ? `?redirectToCompany=${encodeURIComponent(sub)}` : ''
  return `/api/v1/auth/login/federated/${strategy}${query}`
}

function loginWithGoogle() {
  loadingGoogle.value = true
  window.location.href = federatedLoginUrl('google')
}

function loginWithMicrosoft() {
  loadingMicrosoft.value = true
  window.location.href = federatedLoginUrl('microsoft')
}

async function submitForm() {
  if (!isFormValid.value) {
    toast.error(
      isSignup.value
        ? 'Please fill in all fields correctly'
        : 'Please enter both email and password',
    )
    return
  }

  if (isSignup.value && password.value !== confirmPassword.value) {
    toast.error('Passwords do not match')
    return
  }

  loadingLogin.value = true

  try {
    const url = isSignup.value ? '/api/v1/auth/register' : '/api/v1/auth/login'
    const body = isSignup.value
      ? {
          email: email.value,
          password: password.value,
          firstName: firstName.value,
          lastName: lastName.value,
        }
      : {
          email: email.value,
          password: password.value,
        }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      if (isSignup.value) {
        emit('authenticated')
        return
      }
      if (response.redirected) {
        window.location.href = response.url
      }
      return
    }

    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json()
      const errorMessage =
        data?.error?.message ||
        (isSignup.value
          ? 'Registration failed. Please try again.'
          : 'Login failed. Please try again.')

      toast.error(errorMessage)
    } else {
      toast.error(
        isSignup.value
          ? 'Registration failed. Please try again.'
          : 'Login failed. Please try again.',
      )
    }
  } catch (error) {
    console.error('Auth error:', error)
    toast.error('Network error. Please check your connection and try again.')
  } finally {
    loadingLogin.value = false
  }
}
</script>

<template>
  <div class="tw:w-full tw:max-w-105">
    <div class="tw:pb-1">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">
        {{ mode === 'signup' ? 'Sign up to continue' : 'Welcome back' }}
      </div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1">
        {{
          mode === 'signup'
            ? 'Authenticate to create your organization'
            : 'Sign in to access your dashboard'
        }}
      </div>

      <!-- Tenant sign-in: show which workspace this is and a way back to the
           picker. Hidden on the apex host (no workspace) and on signup. -->
      <!-- This is not needed now so it will not get mounted on the page. When needed remove false from v-if -->
      <div v-if="false && !isSignup && workspace" class="tw:mt-3 tw:flex tw:items-center tw:gap-2">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-md tw:bg-main tw:border tw:border-divider tw:px-2 tw:py-1 tw:text-sm tw:font-medium tw:text-on-main"
        >
          <IconBuilding :size="14" class="tw:text-secondary" />
          {{ workspace }}<span class="tw:text-secondary tw:font-normal">{{ domainSuffix }}</span>
        </span>
        <button
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:p-0 tw:cursor-pointer tw:hover:underline"
          @click="goToWorkspacePicker"
        >
          <IconArrowLeft :size="14" />
          Different workspace
        </button>
      </div>
    </div>

    <div class="tw:pt-4">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <button
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3.5 tw:rounded-lg tw:font-medium tw:bg-slate-100 tw:text-on-main tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:cursor-pointer"
          :disabled="loadingMicrosoft"
          @click="loginWithGoogle"
        >
          <span
            v-if="loadingGoogle"
            class="tw:size-5 tw:animate-spin tw:rounded-full tw:border-2 tw:border-slate-400 tw:border-t-transparent tw:inline-block"
          ></span>
          <template v-else>
            <svg class="tw:size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
          </template>
          <span class="tw:font-medium tw:text-sm">Continue with Google</span>
        </button>

        <button
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3.5 tw:rounded-lg tw:font-medium tw:bg-slate-100 tw:text-on-main tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:cursor-pointer"
          :disabled="loadingGoogle"
          @click="loginWithMicrosoft"
        >
          <span
            v-if="loadingMicrosoft"
            class="tw:size-5 tw:animate-spin tw:rounded-full tw:border-2 tw:border-slate-400 tw:border-t-transparent tw:inline-block"
          ></span>
          <template v-else>
            <svg class="tw:size-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="10" height="10" fill="#f25022" />
              <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
              <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
              <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
            </svg>
          </template>
          <span class="tw:font-medium tw:text-sm">Continue with Microsoft</span>
        </button>

        <div class="tw:flex tw:items-center tw:gap-4 tw:my-3">
          <hr class="tw:flex-1 tw:border-divider" />
          <span class="tw:text-xs tw:text-secondary tw:whitespace-nowrap">or</span>
          <hr class="tw:flex-1 tw:border-divider" />
        </div>

        <!-- email/password login form -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <template v-if="isSignup">
            <BaseTextInput v-model="firstName" placeholder="First Name" @keyup.enter="submitForm">
              <template #icon>
                <IconUser :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>

            <BaseTextInput v-model="lastName" placeholder="Last Name" @keyup.enter="submitForm">
              <template #icon>
                <IconUser :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>
          </template>

          <BaseTextInput
            v-model="email"
            type="email"
            placeholder="Email"
            autocomplete="email"
            @keyup.enter="submitForm"
          >
            <template #icon>
              <IconMail :size="16" class="tw:text-secondary" />
            </template>
          </BaseTextInput>

          <div>
            <BaseTextInput
              v-model="password"
              type="password"
              placeholder="Password"
              autocomplete="current-password"
              @keyup.enter="submitForm"
            >
              <template #icon>
                <IconLock :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>
            <p v-if="isSignup" class="tw:text-xs tw:text-secondary tw:mt-1">
              At least 8 characters
            </p>
          </div>

          <BaseTextInput
            v-if="isSignup"
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm Password"
            autocomplete="new-password"
            :errorMsg="
              confirmPassword.length > 0 && password !== confirmPassword
                ? 'Passwords do not match'
                : ''
            "
            @keyup.enter="submitForm"
          >
            <template #icon>
              <IconLock :size="16" class="tw:text-secondary" />
            </template>
          </BaseTextInput>

          <div v-if="mode === 'signin'" class="tw:text-right tw:mb-2">
            <RouterLink to="/forgot-password" class="tw:text-sm tw:text-primary">
              Forgot password?
            </RouterLink>
          </div>

          <button
            class="tw:w-full tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
            :disabled="loadingLogin || !isFormValid"
            @click="submitForm"
          >
            <span
              v-if="loadingLogin"
              class="tw:inline-flex tw:items-center tw:gap-2 tw:justify-center"
            >
              <span
                class="tw:size-4 tw:animate-spin tw:rounded-full tw:border-2 tw:border-white tw:border-t-transparent tw:inline-block"
              ></span>
              {{ isSignup ? 'Signing up...' : 'Signing in...' }}
            </span>
            <span v-else>{{ isSignup ? 'Sign up with email' : 'Sign in' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="tw:pt-6">
      <hr class="tw:border-divider" />
      <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-3">
        <template v-if="isSignup">
          Already have an account?
          <a href="/login" class="tw:text-primary!">Sign in</a>
        </template>
        <template v-else>
          Don't have an account?
          <a href="/signup" class="tw:text-primary!">Sign up</a>
        </template>
      </div>
      <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-2">
        By continuing, you agree to our
        <a href="#" class="tw:text-primary">Terms of Service</a>
        and
        <a href="#" class="tw:text-primary">Privacy Policy</a>
      </div>
    </div>
  </div>
</template>
