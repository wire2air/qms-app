<script setup>
// Recent security events for the current user. Action RPC (read of the
// immutable login_events ledger). Action RPC — see CLAUDE.md rule #4 exception.
import { get } from '@/api'

const events = ref([])
const loading = ref(false)
const page = ref(1)
const pages = ref(1)

// Human labels for the raw event_type codes.
const LABELS = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  ACCOUNT_LOCKED: 'Account locked',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET_COMPLETED: 'Password reset',
  PASSWORD_CHANGE_REQUIRED: 'Password change required',
  MFA_ENABLED: 'Two-factor enabled',
  MFA_DISABLED: 'Two-factor disabled',
  MFA_CHALLENGE_SUCCESS: 'Two-factor verified',
  MFA_CHALLENGE_FAILED: 'Two-factor failed',
  RECOVERY_CODE_USED: 'Recovery code used',
  RECOVERY_CODES_REGENERATED: 'Recovery codes regenerated',
  SESSION_REVOKED: 'Session signed out',
  TRUSTED_DEVICE_ADDED: 'Device trusted',
  TRUSTED_DEVICE_REMOVED: 'Device removed',
}
function label(t) {
  return LABELS[t] || t.replace(/_/g, ' ').toLowerCase()
}

const OUTCOME_CLASS = {
  SUCCESS: 'tw:text-green-600',
  FAILURE: 'tw:text-red-600',
  INFO: 'tw:text-secondary',
}

function fmt(d) {
  return d?.formatDate?.('datetime') ?? String(d ?? '')
}

async function load(reset = false) {
  if (reset) page.value = 1
  try {
    const data = await get(`/v1/auth/login-history?page=${page.value}&limit=15`, {
      loader: loading,
      showError: false,
    })
    events.value = reset ? data.events || [] : [...events.value, ...(data.events || [])]
    pages.value = data.pagination?.pages || 1
  } catch {
    if (reset) events.value = []
  }
}
onMounted(() => load(true))

function loadMore() {
  if (page.value >= pages.value) return
  page.value += 1
  load()
}
</script>

<template>
  <BaseCard>
    <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <li v-for="e in events" :key="e.id" class="tw:flex tw:items-center tw:gap-3 tw:py-2.5">
        <span
          class="tw:h-2 tw:w-2 tw:shrink-0 tw:rounded-full"
          :class="e.outcome === 'FAILURE' ? 'tw:bg-red-500' : e.outcome === 'SUCCESS' ? 'tw:bg-green-500' : 'tw:bg-divider'"
        />
        <div class="tw:min-w-0 tw:flex-1">
          <p class="tw:text-sm tw:font-medium" :class="OUTCOME_CLASS[e.outcome] || 'tw:text-on-main'">
            {{ label(e.eventType) }}
            <span v-if="e.reason" class="tw:font-normal tw:text-secondary">— {{ e.reason }}</span>
          </p>
          <p class="tw:text-caption tw:text-secondary">
            {{ fmt(e.createdAt) }}
            <span v-if="e.ipAddress"> · {{ e.ipAddress }}</span>
            <span v-if="e.browser"> · {{ e.browser }}</span>
          </p>
        </div>
      </li>
    </ul>

    <div v-if="loading && !events.length" class="tw:flex tw:items-center tw:gap-2 tw:py-4">
      <BaseSpinner size="sm" />
      <span class="tw:text-sm tw:text-secondary">Loading…</span>
    </div>
    <p v-else-if="!events.length" class="tw:py-4 tw:text-center tw:text-sm tw:text-secondary">
      No recent activity.
    </p>

    <div v-if="page < pages" class="tw:mt-3 tw:flex tw:justify-center">
      <BaseButton variant="text" size="sm" :isLoading="loading" @click="loadMore">Load more</BaseButton>
    </div>
  </BaseCard>
</template>
