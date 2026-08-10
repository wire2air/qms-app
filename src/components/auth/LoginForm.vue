<script setup>
import { IconUser, IconMail, IconLock, IconBuilding, IconArrowLeft } from '@tabler/icons-vue'
import { currentSubdomain, rootDomain, apexOrigin } from '@/utils/tenant'
import MfaVerifyForm from '@/components/auth/MfaVerifyForm.vue'
import ForcePasswordChangeForm from '@/components/auth/ForcePasswordChangeForm.vue'
import ForceMfaEnrollmentForm from '@/components/auth/ForceMfaEnrollmentForm.vue'
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter.vue'

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

// Which login methods this tenant allows (drives which buttons show). Defaults
// to all-on so the form renders immediately; refined once the fetch resolves.
const methods = ref({ email: true, google: true, microsoft: true })
onMounted(async () => {
  // Show a message if a disabled federated method was attempted (redirect back).
  const url = new URL(window.location.href)
  if (url.searchParams.get('error') === 'method_disabled') {
    toast.error('That sign-in method is disabled for this workspace.')
  }
  if (isSignup.value) return
  try {
    const res = await fetch('/api/v1/auth/login-methods')
    if (res.ok) {
      const data = await res.json()
      if (data?.methods) methods.value = data.methods
    }
  } catch {
    /* keep permissive defaults */
  }
})

// When login succeeds but the account has MFA enrolled, the backend returns a
// pending-MFA challenge instead of a session. We swap the form for the verifier.
const mfaState = ref(null)
// When the account must set a new password first (first login / expiry), the
// backend returns a pending-change challenge; we swap in the force-change form.
const mustChangeState = ref(null)
// When the org requires MFA, the user isn't enrolled, and their grace window has
// elapsed, the backend returns a pending-enrolment token; we swap in the forced
// MFA setup form.
const enrollState = ref(null)

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

// Signup is not tenant-scoped — it always lives on the apex host. From a tenant
// subdomain the link must cross origins; on the apex it resolves to itself.
const signupUrl = computed(() => `${apexOrigin()}/signup`)

// Signup password feedback: a requirements popover anchored to the field while
// it has focus. `passwordValid` is the meter's policy verdict (server-checked,
// client-checklist fallback) and gates the signup submit.
const passwordFocused = ref(false)
const passwordValid = ref(false)

const isFormValid = computed(() => {
  if (!email.value || !password.value) return false
  if (isSignup.value) {
    return (
      firstName.value &&
      lastName.value &&
      confirmPassword.value &&
      password.value === confirmPassword.value &&
      passwordValid.value
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
  if (!isFormValid.value) return

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
        return
      }
      // A 200 without a redirect means the account needs a second factor:
      // the body carries a short-lived pending token + the allowed methods.
      const ct = response.headers.get('content-type')
      if (ct && ct.includes('application/json')) {
        const data = await response.json()
        if (data?.mustChangePassword) {
          mustChangeState.value = {
            pendingToken: data.pendingToken,
            reason: data.reason || 'FIRST_LOGIN',
            email: email.value,
          }
        } else if (data?.mfaRequired) {
          mfaState.value = {
            pendingToken: data.pendingToken,
            availableFactors: data.availableFactors || ['totp'],
            email: email.value,
          }
        } else if (data?.mfaEnrollmentRequired) {
          enrollState.value = {
            pendingToken: data.pendingToken,
            email: email.value,
          }
        }
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
  <ForcePasswordChangeForm
    v-if="mustChangeState"
    :pendingToken="mustChangeState.pendingToken"
    :email="mustChangeState.email"
    :reason="mustChangeState.reason"
    @mfa="
      (m) => {
        mfaState = { ...m, email: mustChangeState.email }
        mustChangeState = null
      }
    "
    @enroll="
      (e) => {
        enrollState = { ...e, email: mustChangeState.email }
        mustChangeState = null
      }
    "
    @cancel="mustChangeState = null"
  />
  <MfaVerifyForm
    v-else-if="mfaState"
    :pendingToken="mfaState.pendingToken"
    :availableFactors="mfaState.availableFactors"
    :email="mfaState.email"
    @cancel="mfaState = null"
  />
  <ForceMfaEnrollmentForm
    v-else-if="enrollState"
    :pendingToken="enrollState.pendingToken"
    :email="enrollState.email"
    @challenge="
      (c) => {
        mfaState = { ...c, email: enrollState.email }
        enrollState = null
      }
    "
    @expired="enrollState = null"
  />
  <div v-else class="tw:w-full tw:max-w-105">
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
          v-if="methods.google"
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3.5 tw:rounded-lg tw:font-medium tw:bg-slate-100 tw:text-on-main tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:cursor-pointer"
          :disabled="loadingMicrosoft"
          @click="loginWithGoogle"
        >
          <BaseSpinner v-if="loadingGoogle" size="sm" color="secondary" />
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
          v-if="methods.microsoft"
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:gap-2 tw:px-5 tw:py-3.5 tw:rounded-lg tw:font-medium tw:bg-slate-100 tw:text-on-main tw:border tw:border-slate-300 tw:hover:bg-slate-200 tw:transition-colors tw:cursor-pointer"
          :disabled="loadingGoogle"
          @click="loginWithMicrosoft"
        >
          <BaseSpinner v-if="loadingMicrosoft" size="sm" color="secondary" />
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

        <div
          v-if="methods.email && (methods.google || methods.microsoft)"
          class="tw:flex tw:items-center tw:gap-4 tw:my-3"
        >
          <hr class="tw:flex-1 tw:border-divider" />
          <span class="tw:text-xs tw:text-secondary tw:whitespace-nowrap">or</span>
          <hr class="tw:flex-1 tw:border-divider" />
        </div>

        <!-- email/password login form -->
        <div v-if="methods.email || isSignup" class="tw:flex tw:flex-col tw:gap-3">
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

          <div class="tw:relative">
            <BaseTextInput
              v-model="password"
              type="password"
              placeholder="Password"
              :autocomplete="isSignup ? 'new-password' : 'current-password'"
              @focus="passwordFocused = true"
              @blur="passwordFocused = false"
              @keyup.enter="submitForm"
            >
              <template #icon>
                <IconLock :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>
            <p v-if="isSignup" class="tw:text-xs tw:text-secondary tw:mt-1">
              At least 8 characters
            </p>

            <!-- Requirements popover — floats under the field while it has focus.
                 pointer-events-none: informational only; clicks pass through to
                 whatever sits beneath (e.g. the confirm field) so no dead click
                 is spent dismissing it. -->
            <Transition
              enterActiveClass="tw:transition tw:duration-150 tw:ease-out"
              enterFromClass="tw:-translate-y-1 tw:opacity-0"
              enterToClass="tw:translate-y-0 tw:opacity-100"
              leaveActiveClass="tw:transition tw:duration-100 tw:ease-in"
              leaveFromClass="tw:translate-y-0 tw:opacity-100"
              leaveToClass="tw:-translate-y-1 tw:opacity-0"
            >
              <div
                v-if="isSignup"
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
              <BaseSpinner size="sm" color="white" />
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
          <a :href="signupUrl" class="tw:text-primary!">Sign up</a>
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
