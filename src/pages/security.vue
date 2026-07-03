<script setup>
// Self-service account security — Phase 1 covers multi-factor authentication.
// Status/disable/regenerate are action RPCs (verb / secret-return endpoints),
// so they use the axios wrapper directly.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
import MfaSetupWizard from '@/components/security/MfaSetupWizard.vue'
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter.vue'
import SecurityDashboard from '@/components/security/SecurityDashboard.vue'
import ActiveSessions from '@/components/security/ActiveSessions.vue'
import TrustedDevices from '@/components/security/TrustedDevices.vue'
import LoginHistory from '@/components/security/LoginHistory.vue'
import {
  IconShieldLock,
  IconShieldCheck,
  IconRefresh,
  IconPower,
  IconAlertTriangle,
  IconCopy,
  IconDownload,
  IconKey,
  IconLock,
  IconDevices,
  IconDeviceDesktop,
  IconHistory,
} from '@tabler/icons-vue'

defineOptions({ name: 'SecurityPage' })

const toast = useToast()

const status = ref(null) // null = loading
const loadingStatus = ref(false)
const enrolling = ref(false)

async function loadStatus() {
  try {
    status.value = await get('/v1/auth/mfa/status', { loader: loadingStatus, showError: true })
  } catch {
    status.value = { enrolled: false, factors: [], recoveryCodesRemaining: 0, keyConfigured: true }
  }
}
onMounted(loadStatus)

const lowRecovery = computed(
  () => status.value?.enrolled && (status.value?.recoveryCodesRemaining ?? 0) <= 3,
)

function onWizardDone() {
  enrolling.value = false
  loadStatus()
}

// ── Verify dialog (shared by disable + regenerate) ──────────────────────────
const dialogOpen = ref(false)
const dialogMode = ref(null) // 'disable' | 'regenerate'
const dialogCode = ref('')
const dialogError = ref('')
const dialogBusy = ref(false)
const newCodes = ref([]) // populated after a successful regenerate

const dialogTitle = computed(() =>
  dialogMode.value === 'disable' ? 'Turn off two-factor' : 'Regenerate recovery codes',
)

function openVerify(mode) {
  dialogMode.value = mode
  dialogCode.value = ''
  dialogError.value = ''
  newCodes.value = []
  dialogOpen.value = true
}

async function confirmVerify() {
  if (dialogBusy.value || dialogCode.value.length < 6) return
  dialogBusy.value = true
  dialogError.value = ''
  try {
    if (dialogMode.value === 'disable') {
      await post(
        '/v1/auth/mfa/disable',
        { method: 'totp', code: dialogCode.value.trim() },
        { loader: dialogBusy, showError: false },
      )
      toast.success('Two-factor authentication turned off')
      dialogOpen.value = false
      loadStatus()
    } else {
      const data = await post(
        '/v1/auth/mfa/recovery-codes/regenerate',
        { method: 'totp', code: dialogCode.value.trim() },
        { loader: dialogBusy, showError: false },
      )
      newCodes.value = data.recoveryCodes || []
      toast.success('New recovery codes generated')
      loadStatus()
    }
  } catch (err) {
    dialogError.value = err?.message || 'Verification failed. Check your code and try again.'
    dialogCode.value = ''
  } finally {
    dialogBusy.value = false
  }
}

// ── Change password ─────────────────────────────────────────────────────────
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const newValid = ref(false)
const changingPw = ref(false)
const pwError = ref('')

const canChangePw = computed(
  () =>
    currentPassword.value &&
    newValid.value &&
    newPassword.value &&
    newPassword.value === confirmPassword.value,
)

async function changePassword() {
  if (changingPw.value || !canChangePw.value) return
  changingPw.value = true
  pwError.value = ''
  try {
    await post(
      '/v1/auth/password/change',
      { currentPassword: currentPassword.value, newPassword: newPassword.value },
      { loader: changingPw, showError: false },
    )
    toast.success('Password updated')
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    pwError.value = err?.message || 'Could not update your password. Try another.'
  } finally {
    changingPw.value = false
  }
}

const newCodesText = computed(() => newCodes.value.join('\n'))
async function copyNewCodes() {
  try {
    await navigator.clipboard.writeText(newCodesText.value)
    toast.info('Recovery codes copied')
  } catch {
    toast.error('Could not copy — copy them manually')
  }
}
function downloadNewCodes() {
  const blob = new Blob(
    [`QMS recovery codes\nKeep these somewhere safe. Each code works once.\n\n${newCodesText.value}\n`],
    { type: 'text/plain' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'qms-recovery-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconShieldLock" title="Security" />

    <SecurityDashboard />

    <PageSection title="Two-factor authentication" :icon="IconShieldCheck">
      <BaseCard>
        <!-- Loading -->
        <div v-if="status === null" class="tw:flex tw:items-center tw:gap-2 tw:py-6">
          <BaseSpinner size="sm" />
          <span class="tw:text-sm tw:text-secondary">Loading…</span>
        </div>

        <!-- Server key missing -->
        <div
          v-else-if="!status.keyConfigured"
          class="tw:flex tw:items-start tw:gap-3 tw:py-2"
        >
          <IconAlertTriangle :size="20" class="tw:mt-0.5 tw:shrink-0 tw:text-warning" />
          <div>
            <p class="tw:text-sm tw:font-medium tw:text-on-main">MFA is temporarily unavailable</p>
            <p class="tw:text-caption tw:text-secondary tw:mt-0.5">
              Your administrator needs to finish configuring the server before authenticator apps can
              be set up.
            </p>
          </div>
        </div>

        <!-- Enrolling: inline wizard -->
        <MfaSetupWizard
          v-else-if="enrolling"
          @complete="onWizardDone"
          @cancel="onWizardDone"
        />

        <!-- Enrolled -->
        <div v-else-if="status.enrolled" class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseBadge class="tw:bg-green-100 tw:text-green-700">
              <IconShieldCheck :size="14" /> Enabled
            </BaseBadge>
            <span class="tw:text-sm tw:text-secondary">Authenticator app</span>
          </div>

          <div
            class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-4 tw:py-3"
            :class="lowRecovery ? 'tw:bg-warning/5' : ''"
          >
            <div>
              <p class="tw:text-sm tw:font-medium tw:text-on-main">Recovery codes</p>
              <p class="tw:text-caption tw:text-secondary">
                {{ status.recoveryCodesRemaining }} unused
                <span v-if="lowRecovery" class="tw:text-warning tw:font-medium">— running low</span>
              </p>
            </div>
            <BaseButton variant="outline" size="sm" @click="openVerify('regenerate')">
              <IconRefresh :size="16" /> Regenerate
            </BaseButton>
          </div>

          <div class="tw:flex tw:justify-end tw:border-t tw:border-divider tw:pt-4">
            <BaseButton variant="danger" size="sm" @click="openVerify('disable')">
              <IconPower :size="16" /> Turn off
            </BaseButton>
          </div>
        </div>

        <!-- Not enrolled -->
        <div v-else class="tw:flex tw:flex-col tw:gap-4">
          <p class="tw:text-sm tw:text-secondary">
            Add a second step to your sign-in. You'll enter a code from an authenticator app
            (Google Authenticator, Microsoft Authenticator, Authy, or 1Password) after your password.
          </p>
          <div>
            <BaseButton variant="primary" @click="enrolling = true">
              <IconShieldCheck :size="16" /> Set up authenticator app
            </BaseButton>
          </div>
        </div>
      </BaseCard>
    </PageSection>

    <PageSection title="Password" :icon="IconKey">
      <BaseCard>
        <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-md">
          <BaseTextInput
            v-model="currentPassword"
            type="password"
            label="Current password"
            placeholder="Current password"
            autocomplete="current-password"
            :disabled="changingPw"
          >
            <template #icon><IconLock :size="16" class="tw:text-secondary" /></template>
          </BaseTextInput>

          <div class="tw:flex tw:flex-col tw:gap-2">
            <BaseTextInput
              v-model="newPassword"
              type="password"
              label="New password"
              placeholder="New password"
              autocomplete="new-password"
              :disabled="changingPw"
            >
              <template #icon><IconLock :size="16" class="tw:text-secondary" /></template>
            </BaseTextInput>
            <PasswordStrengthMeter v-model="newPassword" @update:valid="newValid = $event" />
          </div>

          <BaseTextInput
            v-model="confirmPassword"
            type="password"
            label="Confirm new password"
            placeholder="Confirm new password"
            autocomplete="new-password"
            :disabled="changingPw"
            :errorMsg="
              confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : pwError
            "
            @keyup.enter="changePassword"
          >
            <template #icon><IconLock :size="16" class="tw:text-secondary" /></template>
          </BaseTextInput>

          <div>
            <BaseButton
              variant="primary"
              :isLoading="changingPw"
              :disabled="!canChangePw"
              @click="changePassword"
            >
              Update password
            </BaseButton>
          </div>
        </div>
      </BaseCard>
    </PageSection>

    <PageSection title="Active sessions" :icon="IconDevices">
      <ActiveSessions />
    </PageSection>

    <PageSection title="Devices" :icon="IconDeviceDesktop">
      <TrustedDevices />
    </PageSection>

    <PageSection title="Recent activity" :icon="IconHistory">
      <LoginHistory />
    </PageSection>

    <!-- Verify dialog for disable / regenerate -->
    <BaseDialog v-model="dialogOpen" :title="dialogTitle">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <!-- Regenerate success: show the new codes -->
        <template v-if="newCodes.length">
          <div class="tw:rounded-lg tw:border tw:border-warning/40 tw:bg-warning/10 tw:px-4 tw:py-3">
            <p class="tw:text-sm tw:font-medium tw:text-on-main">Your previous codes no longer work</p>
            <p class="tw:text-caption tw:text-secondary tw:mt-0.5">
              Save these new codes. This is the only time they're shown.
            </p>
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
            <code
              v-for="c in newCodes"
              :key="c"
              class="tw:text-center tw:text-sm tw:tracking-wider tw:text-on-main"
            >
              {{ c }}
            </code>
          </div>
          <div class="tw:flex tw:gap-2">
            <BaseButton variant="outline" size="sm" @click="copyNewCodes">
              <IconCopy :size="16" /> Copy
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="downloadNewCodes">
              <IconDownload :size="16" /> Download
            </BaseButton>
          </div>
        </template>

        <!-- Code entry -->
        <template v-else>
          <p class="tw:text-sm tw:text-secondary">
            {{
              dialogMode === 'disable'
                ? 'Enter a code from your authenticator app to turn off two-factor authentication.'
                : 'Enter a code from your authenticator app to generate a fresh set of recovery codes.'
            }}
          </p>
          <div class="tw:flex tw:justify-center">
            <BaseOtpInput v-model="dialogCode" :length="6" charset="numeric" :errorMsg="dialogError" />
          </div>
        </template>
      </div>

      <template #footer="{ close }">
        <template v-if="newCodes.length">
          <BaseButton variant="primary" @click="close">Done</BaseButton>
        </template>
        <template v-else>
          <BaseButton variant="text" @click="close">Cancel</BaseButton>
          <BaseButton
            :variant="dialogMode === 'disable' ? 'danger' : 'primary'"
            :isLoading="dialogBusy"
            :disabled="dialogCode.length < 6"
            @click="confirmVerify"
          >
            {{ dialogMode === 'disable' ? 'Turn off' : 'Regenerate' }}
          </BaseButton>
        </template>
      </template>
    </BaseDialog>
  </BasePage>
</template>
