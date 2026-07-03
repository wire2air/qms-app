<script setup>
// Organization Security Settings (tenant admin, security:manage).
// Login-method toggles are enforced today; MFA + session policy are stored and
// will be enforced by the MFA-enforcement and session-management phases.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, patch } from '@/api'
import {
  IconShieldLock,
  IconLogin,
  IconWorld,
  IconDeviceMobile,
  IconClock,
  IconKey,
} from '@tabler/icons-vue'

defineOptions({ name: 'OrganizationSecurityPage' })

const toast = useToast()

const TABS = [
  { value: 'methods', label: 'Login methods', icon: IconLogin },
  { value: 'domains', label: 'Allowed domains', icon: IconWorld },
  { value: 'password', label: 'Password policy', icon: IconKey },
  { value: 'mfa', label: 'MFA policy', icon: IconDeviceMobile },
  { value: 'sessions', label: 'Sessions', icon: IconClock },
]
const activeTab = ref('methods')

const MFA_MODES = [
  { value: 'OPTIONAL', label: 'Optional — users choose' },
  { value: 'REQUIRED_FOR_ADMINS', label: 'Required for admins' },
  { value: 'REQUIRED_FOR_ALL', label: 'Required for everyone' },
]

// zxcvbn score floor a password must reach. 0 turns the strength gate off and
// leaves only the character-class rules.
const STRENGTH_OPTIONS = [
  { value: 0, label: 'Off — no strength requirement' },
  { value: 1, label: 'Weak' },
  { value: 2, label: 'Fair' },
  { value: 3, label: 'Good (recommended)' },
  { value: 4, label: 'Strong' },
]

const form = ref(null)
const loading = ref(false)
const saving = ref(false)
const forbidden = ref(false)

async function load() {
  try {
    const data = await get('/v1/admin/security/settings', { loader: loading, showError: false })
    form.value = data.settings
  } catch (err) {
    if (err?.status === 403) forbidden.value = true
    else toast.error('Could not load security settings')
  }
}
onMounted(load)

const emailOtpAllowed = computed({
  get: () => form.value?.allowedFactors?.includes('email_otp') ?? false,
  set: (on) => {
    if (!form.value) return
    const set = new Set(form.value.allowedFactors || [])
    if (on) set.add('email_otp')
    else set.delete('email_otp')
    set.add('totp') // TOTP is always an allowed factor
    form.value.allowedFactors = [...set]
  },
})

async function save() {
  if (!form.value || saving.value) return
  const f = form.value
  const payload = {
    emailLoginEnabled: f.emailLoginEnabled,
    googleLoginEnabled: f.googleLoginEnabled,
    microsoftLoginEnabled: f.microsoftLoginEnabled,
    allowedEmailDomains: f.allowedEmailDomains,
    mfaMode: f.mfaMode,
    mfaAppliesToSso: f.mfaAppliesToSso,
    mfaGracePeriodDays: Number(f.mfaGracePeriodDays),
    allowedFactors: f.allowedFactors?.length ? f.allowedFactors : ['totp'],
    trustedDeviceMaxDays: Number(f.trustedDeviceMaxDays),
    sessionIdleMinutes: Number(f.sessionIdleMinutes),
    sessionAbsoluteHours: Number(f.sessionAbsoluteHours),
    rememberMeEnabled: f.rememberMeEnabled,
    rememberMeAbsoluteHours: Number(f.rememberMeAbsoluteHours),
  }
  const pp = f.passwordPolicy
  if (pp) {
    payload.passwordPolicy = {
      minLength: Number(pp.minLength),
      requireUpper: pp.requireUpper,
      requireLower: pp.requireLower,
      requireNumber: pp.requireNumber,
      requireSymbol: pp.requireSymbol,
      minStrengthScore: Number(pp.minStrengthScore),
      historyDepth: Number(pp.historyDepth),
      expiryDays: Number(pp.expiryDays),
      forceChangeOnFirstLogin: pp.forceChangeOnFirstLogin,
      blockBreached: pp.blockBreached,
      maxFailedAttempts: Number(pp.maxFailedAttempts),
      lockoutDurationMinutes: Number(pp.lockoutDurationMinutes),
    }
  }
  try {
    const data = await patch('/v1/admin/security/settings', payload, {
      loader: saving,
      showError: false,
    })
    form.value = data.settings
    toast.success('Security settings saved')
  } catch (err) {
    toast.error(err?.message || 'Could not save — check the values and try again.')
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconShieldLock" title="Organization security" />

    <div v-if="forbidden" class="tw:py-10 tw:text-center tw:text-secondary">
      You don't have permission to manage security settings.
    </div>

    <div v-else-if="!form" class="tw:flex tw:items-center tw:gap-2 tw:py-10">
      <BaseSpinner size="sm" />
      <span class="tw:text-sm tw:text-secondary">Loading…</span>
    </div>

    <template v-else>
      <BaseTabs v-model="activeTab" :tabs="TABS" ariaLabel="Security settings" />

      <BaseCard class="tw:mt-4">
        <!-- Login methods -->
        <div v-if="activeTab === 'methods'" class="tw:flex tw:flex-col tw:gap-4">
          <p class="tw:text-sm tw:text-secondary">
            Choose how people can sign in to this workspace. At least one method must stay enabled.
          </p>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:font-medium tw:text-on-main">Email &amp; password</span>
            <BaseSwitch v-model="form.emailLoginEnabled" label="Email & password login" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:font-medium tw:text-on-main">Google</span>
            <BaseSwitch v-model="form.googleLoginEnabled" label="Google login" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:font-medium tw:text-on-main">Microsoft</span>
            <BaseSwitch v-model="form.microsoftLoginEnabled" label="Microsoft login" />
          </div>
        </div>

        <!-- Allowed domains -->
        <div v-else-if="activeTab === 'domains'" class="tw:flex tw:flex-col tw:gap-3">
          <p class="tw:text-sm tw:text-secondary">
            Restrict which email domains can join this workspace. Leave empty to allow any domain.
          </p>
          <BaseTagsInput
            v-model="form.allowedEmailDomains"
            placeholder="e.g. acme.com — press Enter to add"
          />
        </div>

        <!-- Password policy -->
        <div
          v-else-if="activeTab === 'password' && form.passwordPolicy"
          class="tw:flex tw:flex-col tw:gap-4"
        >
          <p class="tw:text-sm tw:text-secondary">
            Rules every member's password must satisfy. Applies to sign-up, password
            resets, and forced changes. Tightening these does not retroactively
            invalidate existing passwords until they next change.
          </p>

          <div class="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
            <div>
              <p class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">Minimum length</p>
              <BaseTextInput v-model="form.passwordPolicy.minLength" type="number" :min="6" :max="128" />
            </div>
            <div>
              <p class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">Minimum strength</p>
              <BaseSelect
                v-model="form.passwordPolicy.minStrengthScore"
                :options="STRENGTH_OPTIONS"
                optionLabel="label"
                optionValue="value"
                :required="true"
              />
            </div>
          </div>

          <hr class="tw:border-divider" />

          <p class="tw:text-sm tw:font-medium tw:text-on-main">Character requirements</p>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Require an uppercase letter</span>
            <BaseSwitch v-model="form.passwordPolicy.requireUpper" label="Require uppercase" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Require a lowercase letter</span>
            <BaseSwitch v-model="form.passwordPolicy.requireLower" label="Require lowercase" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Require a number</span>
            <BaseSwitch v-model="form.passwordPolicy.requireNumber" label="Require number" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Require a symbol</span>
            <BaseSwitch v-model="form.passwordPolicy.requireSymbol" label="Require symbol" />
          </div>

          <hr class="tw:border-divider" />

          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <span class="tw:text-sm tw:text-on-main">Block breached passwords</span>
              <p class="tw:text-caption tw:text-secondary">
                Reject passwords found in known data breaches (HaveIBeenPwned).
              </p>
            </div>
            <BaseSwitch v-model="form.passwordPolicy.blockBreached" label="Block breached passwords" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <span class="tw:text-sm tw:text-on-main">Force change on first login</span>
              <p class="tw:text-caption tw:text-secondary">
                Members created by an admin must set a new password on first sign-in.
              </p>
            </div>
            <BaseSwitch
              v-model="form.passwordPolicy.forceChangeOnFirstLogin"
              label="Force change on first login"
            />
          </div>

          <div class="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Password expires after (days)</p>
              <BaseTextInput v-model="form.passwordPolicy.expiryDays" type="number" :min="0" :max="3650" />
              <p class="tw:text-caption tw:text-secondary tw:mt-1">0 = never expires.</p>
            </div>
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Remember last N passwords</p>
              <BaseTextInput v-model="form.passwordPolicy.historyDepth" type="number" :min="0" :max="50" />
              <p class="tw:text-caption tw:text-secondary tw:mt-1">
                Block reuse of this many recent passwords. 0 = off.
              </p>
            </div>
          </div>

          <hr class="tw:border-divider" />

          <p class="tw:text-sm tw:font-medium tw:text-on-main">Account lockout</p>
          <div class="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Lock after N failed attempts</p>
              <BaseTextInput
                v-model="form.passwordPolicy.maxFailedAttempts"
                type="number"
                :min="0"
                :max="100"
              />
              <p class="tw:text-caption tw:text-secondary tw:mt-1">0 = never lock.</p>
            </div>
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Lockout duration (minutes)</p>
              <BaseTextInput
                v-model="form.passwordPolicy.lockoutDurationMinutes"
                type="number"
                :min="1"
                :max="1440"
              />
            </div>
          </div>
        </div>

        <!-- MFA policy -->
        <div v-else-if="activeTab === 'mfa'" class="tw:flex tw:flex-col tw:gap-4">
          <div
            class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:px-3 tw:py-2 tw:text-caption tw:text-secondary"
          >
            Saved now; enforced once MFA-enforcement rollout is enabled.
          </div>
          <div>
            <p class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">Require MFA</p>
            <BaseSelect
              v-model="form.mfaMode"
              :options="MFA_MODES"
              optionLabel="label"
              optionValue="value"
              :required="true"
            />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Also require MFA after Google/Microsoft sign-in</span>
            <BaseSwitch v-model="form.mfaAppliesToSso" label="Require MFA for SSO" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Allow email one-time codes as a factor</span>
            <BaseSwitch v-model="emailOtpAllowed" label="Allow email OTP factor" />
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Enrollment grace period (days)</p>
              <BaseTextInput v-model="form.mfaGracePeriodDays" type="number" />
            </div>
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Trust a device for (days)</p>
              <BaseTextInput v-model="form.trustedDeviceMaxDays" type="number" />
            </div>
          </div>
        </div>

        <!-- Sessions -->
        <div v-else class="tw:flex tw:flex-col tw:gap-4">
          <div
            class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:px-3 tw:py-2 tw:text-caption tw:text-secondary"
          >
            Saved now; enforced once session management is enabled.
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Idle timeout (minutes)</p>
              <BaseTextInput v-model="form.sessionIdleMinutes" type="number" />
            </div>
            <div>
              <p class="tw:text-sm tw:text-on-main tw:mb-1">Absolute timeout (hours)</p>
              <BaseTextInput v-model="form.sessionAbsoluteHours" type="number" />
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-sm tw:text-on-main">Allow “Remember me”</span>
            <BaseSwitch v-model="form.rememberMeEnabled" label="Allow remember me" />
          </div>
          <div v-if="form.rememberMeEnabled">
            <p class="tw:text-sm tw:text-on-main tw:mb-1">Remembered session lasts (hours)</p>
            <BaseTextInput v-model="form.rememberMeAbsoluteHours" type="number" />
          </div>
        </div>

        <div class="tw:mt-6 tw:flex tw:justify-end tw:border-t tw:border-divider tw:pt-4">
          <BaseButton variant="primary" :isLoading="saving" @click="save">Save changes</BaseButton>
        </div>
      </BaseCard>
    </template>
  </BasePage>
</template>
