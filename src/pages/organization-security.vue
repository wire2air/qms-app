<script setup>
// Organization Security Settings (tenant admin, security:manage).
// Login-method toggles are enforced today; MFA + session policy are stored and
// will be enforced by the MFA-enforcement and session-management phases.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, patch } from '@/api'
import { IconShieldLock, IconLogin, IconWorld, IconDeviceMobile, IconClock } from '@tabler/icons-vue'

defineOptions({ name: 'OrganizationSecurityPage' })

const toast = useToast()

const TABS = [
  { value: 'methods', label: 'Login methods', icon: IconLogin },
  { value: 'domains', label: 'Allowed domains', icon: IconWorld },
  { value: 'mfa', label: 'MFA policy', icon: IconDeviceMobile },
  { value: 'sessions', label: 'Sessions', icon: IconClock },
]
const activeTab = ref('methods')

const MFA_MODES = [
  { value: 'OPTIONAL', label: 'Optional — users choose' },
  { value: 'REQUIRED_FOR_ADMINS', label: 'Required for admins' },
  { value: 'REQUIRED_FOR_ALL', label: 'Required for everyone' },
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
