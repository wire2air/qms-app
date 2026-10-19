<script setup>
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { matchesView, matchesStatus, viewCounts, lastActivityMs, parseView } from './deskViews.js'

/**
 * Support Desk workspace — the Intercom-style inbox at /desk/:view/:id?.
 *
 * Full-canvas (App.vue skips the QMS sidebar/header for /desk): a rail of
 * views on the left, the conversation list for the active view, the thread of
 * the selected conversation, and a collapsible details drawer. Everything reads
 * the same CustomerComplaint rows as the classic ticket list, so a ticket is
 * the same ticket on both surfaces; only the shell differs.
 */
const props = defineProps({
  view: { type: String, default: 'mine' },
  conversationId: { type: String, default: null },
})

const router = useRouter()
const route = useRoute()
const userId = computed(() => currentSession.value?.userId ?? null)

// ── Data ────────────────────────────────────────────────────────────────────
const allTickets = useLiveQuery((db) => db.CustomerComplaint.where().exec(), {
  models: ['CustomerComplaint'],
  initial: [],
})
const brands = useLiveQuery(
  async (db) => {
    const rows = await db.SupportBrand.where().exec()
    return rows
      .filter((b) => b.stateId !== 'INACTIVE')
      .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name))
  },
  { models: ['SupportBrand'], initial: [] },
)
// Latest message per ticket — the preview line + "who spoke last".
const lastMessages = useLiveQuery(
  async (db) => {
    const rows = await db.CustomerComplaintMessage.where().exec()
    const byTicket = new Map()
    for (const m of rows) {
      if (m.kind === 'QA_NOTE') continue
      const prev = byTicket.get(m.complaintId)
      if (!prev || (m.createdAt?.toMillis?.() ?? 0) > (prev.createdAt?.toMillis?.() ?? 0))
        byTicket.set(m.complaintId, m)
    }
    return byTicket
  },
  { models: ['CustomerComplaintMessage'], initial: new Map() },
)

// "now" ticks once a minute so snoozes wake and ages roll without a sync event.
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(tick))

const ctx = computed(() => ({ userId: userId.value, now: now.value }))
const counts = computed(() => viewCounts(allTickets.value, brands.value, ctx.value))

// ── List state (status toggle, search, sort) ────────────────────────────────
const activeView = computed(() => props.view)
const viewInfo = computed(() => parseView(activeView.value))
const lifecycleAgnostic = computed(
  () => viewInfo.value.kind === 'view' && ['snoozed', 'spam'].includes(viewInfo.value.id),
)
const status = ref('open') // open | closed | all
const search = ref('')
const sort = ref('activity') // activity | newest | oldest | waiting

const conversations = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = allTickets.value.filter(
    (r) =>
      matchesView(r, activeView.value, ctx.value) &&
      (lifecycleAgnostic.value || matchesStatus(r, status.value)),
  )
  if (q) {
    rows = rows.filter(
      (r) =>
        r.subject?.toLowerCase().includes(q) ||
        r.complaintNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q) ||
        r.customerCompany?.toLowerCase().includes(q),
    )
  }
  const created = (r) => r.createdAt?.toMillis?.() ?? 0
  const waitingSince = (r) =>
    r.lastCustomerMessageAt?.toMillis?.() ?? r.createdAt?.toMillis?.() ?? 0
  if (sort.value === 'newest') rows.sort((a, b) => created(b) - created(a))
  else if (sort.value === 'oldest') rows.sort((a, b) => created(a) - created(b))
  else if (sort.value === 'waiting') rows.sort((a, b) => waitingSince(a) - waitingSince(b))
  else rows.sort((a, b) => lastActivityMs(b) - lastActivityMs(a))
  return rows
})

// ── Selection + navigation ──────────────────────────────────────────────────
function pathFor(view, id) {
  return getCompanyPath(id ? `/desk/${view}/${id}` : `/desk/${view}`)
}
function openView(view) {
  // Keep the open conversation when it also lives in the next view; otherwise
  // land on the list so the thread pane never shows a ticket the list hides.
  const keep =
    props.conversationId &&
    allTickets.value.some((r) => r.id === props.conversationId && matchesView(r, view, ctx.value))
  router.push(pathFor(view, keep ? props.conversationId : null))
}
function openConversation(id) {
  router.push(pathFor(activeView.value, id))
}
function closeConversation() {
  router.push(pathFor(activeView.value, null))
}

// j / k move through the list, Esc leaves the thread — ignored while typing.
useEventListener(window, 'keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (
    t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable)
  )
    return
  if (e.key !== 'j' && e.key !== 'k' && e.key !== 'Escape') return
  if (e.key === 'Escape') {
    if (props.conversationId) closeConversation()
    return
  }
  const list = conversations.value
  if (!list.length) return
  const i = list.findIndex((r) => r.id === props.conversationId)
  const next = e.key === 'j' ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0)
  if (list[next] && list[next].id !== props.conversationId) openConversation(list[next].id)
  e.preventDefault()
})

// ── Details drawer (persisted per user) ─────────────────────────────────────
const detailsOpen = ref(true)
try {
  detailsOpen.value = localStorage.getItem('desk:details') !== '0'
} catch {
  /* private mode — default stays */
}
watch(detailsOpen, (v) => {
  try {
    localStorage.setItem('desk:details', v ? '1' : '0')
  } catch {
    /* ignore */
  }
})

// On phones the three panes stack: list OR thread, never both.
const isNarrow = useMediaQuery('(max-width: 1023px)')
const railOpen = ref(false)
watch(
  () => route.fullPath,
  () => (railOpen.value = false),
)
</script>

<template>
  <div class="tw:flex tw:h-screen tw:w-full tw:overflow-hidden tw:bg-main tw:text-on-main">
    <!-- Rail -->
    <SupportDeskRail
      :view="activeView"
      :counts="counts"
      :brands="brands"
      :open="railOpen || !isNarrow"
      :overlay="isNarrow"
      @select="openView"
      @close="railOpen = false"
    />

    <!-- Conversation list -->
    <SupportDeskConversationList
      v-show="!isNarrow || !conversationId"
      v-model:status="status"
      v-model:search="search"
      v-model:sort="sort"
      :view="activeView"
      :brands="brands"
      :conversations="conversations"
      :lastMessages="lastMessages"
      :selectedId="conversationId"
      :lifecycleAgnostic="lifecycleAgnostic"
      :now="now"
      :showMenuButton="isNarrow"
      @select="openConversation"
      @menu="railOpen = true"
    />

    <!-- Thread + details -->
    <template v-if="conversationId">
      <SupportDeskThread
        v-show="!isNarrow || conversationId"
        :key="conversationId"
        :conversationId="conversationId"
        :detailsOpen="detailsOpen"
        :showBack="isNarrow"
        @toggleDetails="detailsOpen = !detailsOpen"
        @back="closeConversation"
      />
      <SupportDeskDetails
        v-if="detailsOpen && !isNarrow"
        :conversationId="conversationId"
        @close="detailsOpen = false"
        @openConversation="openConversation"
      />
    </template>
    <div
      v-else-if="!isNarrow"
      class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:text-secondary"
    >
      <BaseEmptyState
        title="Pick a conversation"
        description="Select a ticket from the list, or press j / k to move through it."
      />
    </div>
  </div>
</template>
