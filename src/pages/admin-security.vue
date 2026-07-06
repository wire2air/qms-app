<script setup>
// Admin Security Center (security:manage): act on a user's security state and
// review the tenant's security event feed. Action RPCs (verb endpoints + a
// filtered ledger read). Action RPC — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import {
  IconShieldCog,
  IconLockOpen,
  IconDeviceMobileOff,
  IconKey,
  IconLogout,
  IconBan,
  IconCircleCheck,
} from '@tabler/icons-vue'

defineOptions({ name: 'AdminSecurityPage' })

const toast = useToast()

// ── Manage a user ────────────────────────────────────────────────────────────
const selectedUserId = ref(null)
const overview = ref(null)
const loadingOverview = ref(false)
const forbidden = ref(false)

async function loadOverview() {
  overview.value = null
  if (!selectedUserId.value) return
  try {
    const data = await get(`/v1/admin/security/users/${selectedUserId.value}/overview`, {
      loader: loadingOverview,
      showError: false,
    })
    overview.value = data
  } catch (err) {
    if (err?.status === 403) forbidden.value = true
    else toast.error('Could not load user security state')
  }
}
watch(selectedUserId, loadOverview)

// Confirm dialog for destructive actions.
const confirmOpen = ref(false)
const pending = ref(null) // { key, label, endpoint, danger, body }
const runningAction = ref(false)

const ACTIONS = {
  unlock: { label: 'Unlock account', endpoint: 'unlock', icon: IconLockOpen, danger: false, confirm: false },
  'reset-mfa': { label: 'Reset MFA', endpoint: 'reset-mfa', icon: IconDeviceMobileOff, danger: true, confirm: true },
  'force-password-reset': { label: 'Force password reset', endpoint: 'force-password-reset', icon: IconKey, danger: true, confirm: true },
  'force-logout': { label: 'Force logout', endpoint: 'force-logout', icon: IconLogout, danger: true, confirm: true },
  suspend: { label: 'Suspend user', endpoint: 'suspend', icon: IconBan, danger: true, confirm: true },
  activate: { label: 'Activate user', endpoint: 'activate', icon: IconCircleCheck, danger: false, confirm: false },
}

function startAction(key) {
  const a = ACTIONS[key]
  if (a.confirm) {
    pending.value = { key, ...a }
    confirmOpen.value = true
  } else {
    execute(key)
  }
}

async function execute(key) {
  const a = ACTIONS[key]
  runningAction.value = true
  try {
    await post(`/v1/admin/security/users/${selectedUserId.value}/${a.endpoint}`, {}, { showError: false })
    toast.success(`${a.label} — done`)
    confirmOpen.value = false
    await loadOverview()
    await loadEvents(true)
  } catch (err) {
    toast.error(err?.message || `Could not ${a.label.toLowerCase()}`)
  } finally {
    runningAction.value = false
  }
}

const availableActions = computed(() => {
  if (!overview.value) return []
  const isCurrentUser = selectedUserId.value === currentSession.value?.id
  const keys = ['unlock', 'reset-mfa', 'force-password-reset']
  if (!isCurrentUser) keys.push('force-logout')
  if (overview.value.user?.status === 'INACTIVE') {
    keys.push('activate')
  } else if (!isCurrentUser) {
    keys.push('suspend')
  }
  return keys
})

// ── Security events feed ─────────────────────────────────────────────────────
const events = ref([])
const loadingEvents = ref(false)
const evPage = ref(1)
const evPages = ref(1)
const filterEmail = ref('')

const OUTCOME_DOT = { SUCCESS: 'tw:bg-green-500', FAILURE: 'tw:bg-red-500', INFO: 'tw:bg-divider' }
function fmt(d) {
  return d?.formatDate?.('datetime') ?? String(d ?? '')
}
function label(t) {
  return t.replace(/_/g, ' ').toLowerCase()
}

async function loadEvents(reset = false) {
  if (reset) evPage.value = 1
  const params = new URLSearchParams({ page: String(evPage.value), limit: '20' })
  if (filterEmail.value) params.set('email', filterEmail.value)
  try {
    const data = await get(`/v1/admin/security/events?${params.toString()}`, {
      loader: loadingEvents,
      showError: false,
    })
    events.value = reset ? data.events || [] : [...events.value, ...(data.events || [])]
    evPages.value = data.pagination?.pages || 1
  } catch (err) {
    if (err?.status === 403) forbidden.value = true
    else if (reset) events.value = []
  }
}
onMounted(() => loadEvents(true))

const searchEvents = useDebounceFn(() => loadEvents(true), 400)
watch(filterEmail, searchEvents)

function loadMoreEvents() {
  if (evPage.value >= evPages.value) return
  evPage.value += 1
  loadEvents()
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconShieldCog" title="Security center" />

    <div v-if="forbidden" class="tw:py-10 tw:text-center tw:text-secondary">
      You don't have permission to use the security center.
    </div>

    <template v-else>
      <PageSection title="Manage a user" :icon="IconShieldCog">
        <BaseCard>
          <div class="tw:max-w-md">
            <p class="tw:text-sm tw:text-secondary tw:mb-1">Select a user</p>
            <UserSelectMenu v-model="selectedUserId" :required="false" />
          </div>

          <div v-if="loadingOverview" class="tw:mt-4 tw:flex tw:items-center tw:gap-2">
            <BaseSpinner size="sm" />
            <span class="tw:text-sm tw:text-secondary">Loading…</span>
          </div>

          <div v-else-if="overview" class="tw:mt-5 tw:flex tw:flex-col tw:gap-4">
            <div class="tw:grid tw:grid-cols-2 tw:gap-3 tw:sm:grid-cols-4">
              <div class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2">
                <p class="tw:text-caption tw:text-secondary">Status</p>
                <p class="tw:text-sm tw:font-medium" :class="overview.user.status === 'INACTIVE' ? 'tw:text-red-600' : 'tw:text-on-main'">
                  {{ overview.user.status === 'INACTIVE' ? 'Suspended' : overview.user.status }}
                </p>
              </div>
              <div class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2">
                <p class="tw:text-caption tw:text-secondary">Locked</p>
                <p class="tw:text-sm tw:font-medium" :class="overview.security.locked ? 'tw:text-red-600' : 'tw:text-on-main'">
                  {{ overview.security.locked ? 'Yes' : 'No' }}
                </p>
              </div>
              <div class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2">
                <p class="tw:text-caption tw:text-secondary">MFA</p>
                <p class="tw:text-sm tw:font-medium">{{ overview.security.mfaEnrolled ? 'On' : 'Off' }}</p>
              </div>
              <div class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2">
                <p class="tw:text-caption tw:text-secondary">Sessions</p>
                <p class="tw:text-sm tw:font-medium">{{ overview.security.activeSessions }}</p>
              </div>
            </div>

            <div class="tw:flex tw:flex-wrap tw:gap-2 tw:border-t tw:border-divider tw:pt-4">
              <BaseButton
                v-for="key in availableActions"
                :key="key"
                :variant="ACTIONS[key].danger ? 'outline' : 'primary'"
                size="sm"
                :disabled="runningAction"
                @click="startAction(key)"
              >
                <component :is="ACTIONS[key].icon" :size="16" />
                {{ ACTIONS[key].label }}
              </BaseButton>
            </div>
          </div>
        </BaseCard>
      </PageSection>

      <PageSection title="Security events" :icon="IconShieldCog">
        <BaseCard>
          <div class="tw:mb-3 tw:max-w-xs">
            <BaseTextInput v-model="filterEmail" placeholder="Filter by email…" size="sm" />
          </div>
          <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
            <li v-for="e in events" :key="e.id" class="tw:flex tw:items-center tw:gap-3 tw:py-2.5">
              <span class="tw:h-2 tw:w-2 tw:shrink-0 tw:rounded-full" :class="OUTCOME_DOT[e.outcome] || 'tw:bg-divider'" />
              <div class="tw:min-w-0 tw:flex-1">
                <p class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ label(e.eventType) }}
                  <span class="tw:font-normal tw:text-secondary">· {{ e.email || 'unknown' }}</span>
                </p>
                <p class="tw:text-caption tw:text-secondary">
                  {{ fmt(e.createdAt) }}
                  <span v-if="e.ipAddress"> · {{ e.ipAddress }}</span>
                  <span v-if="e.reason"> · {{ e.reason }}</span>
                </p>
              </div>
            </li>
          </ul>
          <div v-if="loadingEvents && !events.length" class="tw:flex tw:items-center tw:gap-2 tw:py-4">
            <BaseSpinner size="sm" />
            <span class="tw:text-sm tw:text-secondary">Loading…</span>
          </div>
          <p v-else-if="!events.length" class="tw:py-4 tw:text-center tw:text-sm tw:text-secondary">
            No security events.
          </p>
          <div v-if="evPage < evPages" class="tw:mt-3 tw:flex tw:justify-center">
            <BaseButton variant="text" size="sm" :isLoading="loadingEvents" @click="loadMoreEvents">
              Load more
            </BaseButton>
          </div>
        </BaseCard>
      </PageSection>
    </template>

    <!-- Confirm destructive action -->
    <BaseDialog v-model="confirmOpen" :title="pending?.label || 'Confirm'">
      <p class="tw:text-sm tw:text-secondary">
        This will affect the selected user immediately. Are you sure you want to
        {{ (pending?.label || '').toLowerCase() }}?
      </p>
      <template #footer="{ close }">
        <BaseButton variant="text" @click="close">Cancel</BaseButton>
        <BaseButton variant="danger" :isLoading="runningAction" @click="execute(pending.key)">
          {{ pending?.label }}
        </BaseButton>
      </template>
    </BaseDialog>
  </BasePage>
</template>
