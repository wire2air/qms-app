<script setup>
// Active sessions list with per-session + bulk revoke. Action RPCs (session
// outcomes, not synced entities). Action RPC — see CLAUDE.md rule #4 exception.
import { get, post, del } from '@/api'
import { IconDeviceDesktop, IconDeviceMobile, IconTrash } from '@tabler/icons-vue'

const toast = useToast()

const sessions = ref(null)
const loading = ref(false)
const busy = ref(false)

async function load() {
  try {
    const data = await get('/v1/auth/sessions', { loader: loading, showError: false })
    sessions.value = data.sessions || []
  } catch {
    sessions.value = []
  }
}
onMounted(load)

function rel(d) {
  return d?.toRelative?.() ?? String(d ?? '')
}

async function revokeOne(s) {
  if (busy.value) return
  busy.value = true
  try {
    await del(`/v1/auth/sessions/${s.id}`, { showError: false })
    toast.success('Session signed out')
    await load()
  } catch {
    toast.error('Could not sign out that session')
  } finally {
    busy.value = false
  }
}

async function revokeOthers() {
  if (busy.value) return
  busy.value = true
  try {
    const data = await post('/v1/auth/sessions/revoke-others', {}, { showError: false })
    toast.success(`Signed out ${data.revoked || 0} other session(s)`)
    await load()
  } catch {
    toast.error('Could not sign out other sessions')
  } finally {
    busy.value = false
  }
}

async function revokeAll() {
  if (busy.value) return
  busy.value = true
  try {
    await post('/v1/auth/sessions/revoke-all', {}, { showError: false })
    // Current session is now gone — send the user to sign in again.
    window.location.assign('/signin')
  } catch {
    toast.error('Could not sign out all sessions')
    busy.value = false
  }
}

const hasOthers = computed(() => (sessions.value || []).some((s) => !s.isCurrent))
</script>

<template>
  <BaseCard>
    <div v-if="sessions === null" class="tw:flex tw:items-center tw:gap-2 tw:py-4">
      <BaseSpinner size="sm" />
      <span class="tw:text-sm tw:text-secondary">Loading…</span>
    </div>

    <template v-else>
      <div v-if="hasOthers" class="tw:mb-3 tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" size="sm" :isLoading="busy" @click="revokeOthers">
          Log out other sessions
        </BaseButton>
        <BaseButton variant="danger" size="sm" :disabled="busy" @click="revokeAll">
          Log out everywhere
        </BaseButton>
      </div>

      <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li v-for="s in sessions" :key="s.id" class="tw:flex tw:items-center tw:gap-3 tw:py-3">
          <component
            :is="/mobile|tablet/i.test(s.browser || '') ? IconDeviceMobile : IconDeviceDesktop"
            :size="20"
            class="tw:shrink-0 tw:text-secondary"
          />
          <div class="tw:min-w-0 tw:flex-1">
            <p class="tw:text-sm tw:font-medium tw:text-on-main">
              {{ s.browser || 'Unknown browser' }}<span v-if="s.os"> · {{ s.os }}</span>
              <BaseBadge v-if="s.isCurrent" class="tw:ml-2 tw:bg-green-100 tw:text-green-700">
                This device
              </BaseBadge>
            </p>
            <p class="tw:text-caption tw:text-secondary">
              {{ s.ipAddress || 'Unknown IP' }} · active {{ rel(s.lastSeenAt) }}
            </p>
          </div>
          <BaseButton
            v-if="!s.isCurrent"
            variant="text"
            size="sm"
            :disabled="busy"
            aria-label="Sign out session"
            @click="revokeOne(s)"
          >
            <IconTrash :size="16" />
          </BaseButton>
        </li>
      </ul>

      <p v-if="!sessions.length" class="tw:py-4 tw:text-center tw:text-sm tw:text-secondary">
        No active sessions found.
      </p>
    </template>
  </BaseCard>
</template>
