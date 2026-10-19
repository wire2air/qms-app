<script setup>
import { IconCircleFilled, IconChevronDown } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

/**
 * The agent's own presence pill (spec §6): Online / Away / Offline, shown in
 * the Support Desk header for users who are agents. While mounted it sends a
 * heartbeat every 30 s — the server treats a missing heartbeat as offline
 * (support_agent_available), so closing the tab is enough to drop out of the
 * auto-assign pool. Manual OFFLINE always wins over the schedule.
 */
const toast = useToast()
const userId = computed(() => currentSession.value?.userId ?? null)

const me = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => (uid ? db.SupportAgent.where('userId', uid).first() : null),
  { models: ['SupportAgent'] },
)
const onlineCount = useLiveQuery(
  async (db) => {
    const cutoff = Date.now() - 90_000
    return (await db.SupportAgent.where().exec()).filter(
      (a) => a.manualStatus === 'ONLINE' && (a.lastSeenAt?.toMillis?.() ?? 0) > cutoff,
    ).length
  },
  { models: ['SupportAgent'], initial: 0 },
)

const STATUSES = [
  { id: 'ONLINE', name: 'Online', dot: 'tw:text-green-500', hint: 'Taking new chats and tickets' },
  { id: 'AWAY', name: 'Away', dot: 'tw:text-amber-500', hint: 'Visible, not auto-assigned' },
  { id: 'OFFLINE', name: 'Offline', dot: 'tw:text-gray-400', hint: 'Out of the pool' },
]
const current = computed(() => STATUSES.find((s) => s.id === me.value?.manualStatus) ?? STATUSES[2])
const busy = ref(false)

async function setStatus(status) {
  if (busy.value || status === me.value?.manualStatus) return
  busy.value = true
  try {
    await post('/v1/services/supportDesk/agents/me/presence', { status })
    if (me.value) me.value.manualStatus = status // optimistic; sync confirms
  } catch (e) {
    toast.error(e?.message || 'Could not change status')
  } finally {
    busy.value = false
  }
}

// Heartbeat while the desk is open and the agent is not OFFLINE.
let timer = null
async function beat() {
  if (!me.value || me.value.manualStatus === 'OFFLINE') return
  try {
    await post('/v1/services/supportDesk/agents/me/heartbeat', {})
  } catch {
    /* transient — the next beat retries */
  }
}
onMounted(() => {
  timer = setInterval(beat, 30_000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(
  () => me.value?.manualStatus,
  (s) => {
    if (s && s !== 'OFFLINE') beat()
  },
)

const menuItems = computed(() =>
  STATUSES.map((s) => ({
    name: s.id === me.value?.manualStatus ? `${s.name} ✓` : `${s.name} — ${s.hint}`,
    click: () => setStatus(s.id),
    disabled: busy.value,
  })),
)
</script>

<template>
  <BaseMenu v-if="me" :items="menuItems">
    <!-- The click bubbles to BaseMenu's popover and opens it. -->
    <template #trigger>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-divider tw:px-2.5 tw:py-1 tw:text-sm tw:bg-sidebar tw:hover:bg-main-hover"
        :title="`${current.hint}. ${onlineCount} agent${onlineCount === 1 ? '' : 's'} online.`"
        :aria-label="`Your status: ${current.name}`"
        aria-haspopup="menu"
      >
        <IconCircleFilled :size="10" :class="current.dot" />
        <span class="tw:font-medium">{{ current.name }}</span>
        <span class="tw:text-xs tw:text-secondary">· {{ onlineCount }} online</span>
        <IconChevronDown :size="14" class="tw:text-secondary" />
      </button>
    </template>
  </BaseMenu>
</template>
