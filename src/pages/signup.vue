<script setup>
import {
  IconCircleCheck,
  IconLogout,
  IconBuilding,
  IconTag,
  IconLoader,
  IconCircleX,
  IconKey,
} from '@tabler/icons-vue'
import LoginForm from '@/components/auth/LoginForm.vue'
import TimezoneDropdown from '@/components/common/TimezoneDropdown.vue'
import { useCompanyForm } from '@/composables/useCompanyForm.js'
import { currentSession, initSession, logoutCurrentSession } from '@/utils/currentSession.js'
import { gotoTenant } from '@/utils/tenant.js'

defineOptions({
  name: 'SignupPage',
})

const props = defineProps({
  isAddClient: {
    type: Boolean,
    default: false,
  },
})

// Session state
const sessionLoading = ref(true)

// Use company form composable
const { companyForm, isSubmitting, submitError, signup, getCompanyNameFromEmail, isPersonalEmail } =
  useCompanyForm(props, false)

// Check authentication and initialize session
async function checkSession() {
  try {
    await initSession()

    // If user already has companies, forward into the first one's subdomain
    // (via the backend auth handoff, so the session cookie lands there too).
    const companies = currentSession.value?.companies
    if (companies && Object.keys(companies).length > 0) {
      const firstCompanyCode = Object.values(companies)[0].code
      gotoTenant(firstCompanyCode, '/dashboard')
      return
    }

    // If authenticated with work email, pre-fill company name
    if (currentSession.value?.email && !isPersonalEmail.value) {
      const suggestedName = getCompanyNameFromEmail(currentSession.value.email)
      if (suggestedName && !companyForm.name) {
        companyForm.name = suggestedName
      }
    }
  } finally {
    sessionLoading.value = false
  }
}

// Handle successful authentication from login component
function handleAuthenticated() {
  checkSession()
}

// Initialize timezones and check session
onMounted(async () => {
  await checkSession()
})
</script>

<template>
  <div
    v-if="sessionLoading"
    class="tw:w-full tw:h-full tw:flex tw:flex-col tw:items-center tw:justify-center"
  >
    <BaseSpinner size="lg" />
    <div class="tw:text-secondary tw:mt-4">Loading...</div>
  </div>

  <!-- Show Login if not authenticated -->
  <div v-else-if="!currentSession?.email" class="tw:min-h-screen tw:bg-gray-100 tw:flex">
    <!-- Left branding -->
    <div
      class="tw:flex-1 tw:bg-linear-to-br tw:from-indigo-900 tw:to-indigo-700 tw:hidden md:tw:flex tw:items-center tw:justify-center tw:p-12 tw:text-white"
    >
      <div class="tw:max-w-sm">
        <BrandLogo tone="mono" class="tw:h-12 tw:mb-4" />
        <p class="tw:text-lg tw:opacity-90 tw:mb-12">Quality Management System</p>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Sign In to Continue</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Create Your Organization</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Start Managing Quality</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right - Login Form -->
    <div class="tw:flex-1 tw:bg-white tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8">
      <LoginForm mode="signup" @authenticated="handleAuthenticated" />
      <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-6">
        &copy; 2026 Quality Management System. All rights reserved.
      </div>
    </div>
  </div>

  <!-- Show Signup Form if authenticated -->
  <div v-else class="tw:min-h-screen tw:bg-gray-100 tw:flex">
    <!-- Left branding -->
    <div
      class="tw:flex-1 tw:bg-linear-to-br tw:from-indigo-900 tw:to-indigo-700 tw:hidden md:tw:flex tw:items-center tw:justify-center tw:p-12 tw:text-white"
    >
      <div class="tw:max-w-sm">
        <BrandLogo tone="mono" class="tw:h-12 tw:mb-4" />
        <p class="tw:text-lg tw:opacity-90 tw:mb-12">Quality Management System</p>
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Create Your Organization</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Invite Your Team</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" />
            <span>Start Managing Quality</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right - Signup Form -->
    <div class="tw:flex-1 tw:bg-white tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8">
      <div class="tw:w-full tw:max-w-125">
        <!-- User Info Header -->
        <div
          class="tw:bg-gray-50 tw:rounded-t-lg tw:p-4 tw:flex tw:items-center tw:justify-between"
        >
          <div>
            <div class="tw:text-xs tw:text-secondary">Signing up as</div>
            <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ currentSession?.email }}</div>
          </div>
          <button
            class="tw:flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1.5 tw:rounded tw:text-red-600 tw:text-sm tw:font-medium tw:hover:bg-red-50 tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="logoutCurrentSession"
          >
            <IconLogout :size="16" />
            Sign Out
          </button>
        </div>

        <!-- Form -->
        <div class="tw:p-6">
          <div class="tw:text-xl tw:font-bold tw:text-on-main">Create Your Organization</div>
          <div class="tw:text-sm tw:text-secondary tw:mt-1 tw:mb-6">
            Set up your company workspace
          </div>

          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Company Name -->
            <BaseTextInput
              v-model="companyForm.name"
              placeholder="Company Name"
              :disabled="isSubmitting"
              :errorMsg="
                companyForm.submitted && !companyForm.name.trim() ? 'Company name is required' : ''
              "
            >
              <template #icon>
                <IconBuilding :size="16" class="tw:text-secondary" />
              </template>
            </BaseTextInput>

            <!-- Company Code -->
            <div>
              <BaseTextInput
                v-model="companyForm.code"
                placeholder="Company Code"
                :disabled="isSubmitting"
                :errorMsg="
                  companyForm.submitted && !companyForm.code.trim()
                    ? companyForm.isAvailable === false
                      ? 'This code is not available'
                      : 'Company code is required'
                    : ''
                "
              >
                <template #icon>
                  <IconTag :size="16" class="tw:text-secondary" />
                </template>
              </BaseTextInput>
              <div
                v-if="companyForm.isChecking"
                class="tw:flex tw:items-center tw:gap-1.5 tw:mt-1 tw:text-xs tw:text-secondary"
              >
                <IconLoader :size="14" class="tw:animate-spin" />
                Checking availability...
              </div>
              <div
                v-else-if="companyForm.isAvailable === true"
                class="tw:flex tw:items-center tw:gap-1.5 tw:mt-1 tw:text-xs tw:text-green-600"
              >
                <IconCircleCheck :size="14" />
                This code is available
              </div>
              <div
                v-else-if="companyForm.isAvailable === false"
                class="tw:flex tw:items-center tw:gap-1.5 tw:mt-1 tw:text-xs tw:text-red-600"
              >
                <IconCircleX :size="14" />
                This code is not available
              </div>
            </div>

            <!-- Timezone -->
            <TimezoneDropdown
              v-model="companyForm.defaultTimeZone"
              label="Timezone"
              :disabled="isSubmitting"
            />

            <!-- Invitation Code -->
            <div>
              <div
                class="tw:flex tw:items-center tw:gap-1.5 tw:mb-2 tw:text-sm tw:font-medium tw:text-on-main"
              >
                <IconKey :size="16" class="tw:text-secondary" />
                Invitation Code
              </div>
              <BaseOtpInput
                v-model="companyForm.invitationCode"
                :length="8"
                charset="alnum"
                :disabled="isSubmitting"
                :errorMsg="
                  companyForm.invitationCode.length > 0 &&
                  !/^[A-Z0-9]{8}$/.test(companyForm.invitationCode.toUpperCase())
                    ? 'Invitation code must be 8 characters'
                    : companyForm.submitted && !companyForm.invitationCode.trim()
                      ? 'Invitation code is required'
                      : ''
                "
              />
              <p class="tw:text-xs tw:text-secondary tw:mt-2">
                Don't have a code? Contact
                <a href="mailto:info@qability.net" class="tw:text-primary">info@qability.net</a>
              </p>
            </div>

            <!-- Error Message -->
            <div v-if="submitError" class="tw:text-red-600 tw:text-xs">
              {{ submitError }}
            </div>

            <!-- Submit Button -->
            <button
              class="tw:w-full tw:mt-2 tw:py-3 tw:px-4 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0 disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
              :disabled="isSubmitting || !companyForm.isValid || companyForm.isAvailable === false"
              @click="signup"
            >
              <span
                v-if="isSubmitting"
                class="tw:inline-flex tw:items-center tw:justify-center tw:gap-2"
              >
                <BaseSpinner size="sm" color="white" />
                Creating...
              </span>
              <span v-else>Create Organization</span>
            </button>
          </div>

          <hr class="tw:border-divider tw:my-6" />
          <div class="tw:text-xs tw:text-secondary tw:text-center">
            Already have an account?
            <a href="/login" class="tw:text-primary!">Sign In</a>
          </div>
        </div>
      </div>

      <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-8">
        &copy; 2026 Quality Management System. All rights reserved.
      </div>
    </div>
  </div>
</template>
