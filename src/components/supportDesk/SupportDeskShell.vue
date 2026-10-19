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
// One pass over messages: latest per ticket (preview line + "who spoke last")
// and the tickets whose internal notes @mention me (the Mentions view).
const messageIndex = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    const rows = await db.CustomerComplaintMessage.where().exec()
    const last = new Map()
    const mentioned = new Set()
    for (const m of rows) {
      if (m.kind === 'QA_NOTE') continue
      if (uid && m.mentionedUserIds?.includes?.(uid)) mentioned.add(m.complaintId)
      const prev = last.get(m.complaintId)
      if (!prev || (m.createdAt?.toMillis?.() ?? 0) > (prev.createdAt?.toMillis?.() ?? 0))
        last.set(m.complaintId, m)
    }
    return { last, mentioned }
  },
  { models: ['CustomerComplaintMessage'], initial: { last: new Map(), mentioned: new Set() } },
)
const lastMessages = computed(() => messageIndex.value.last)

// "now" ticks once a minute so snoozes wake and ages roll without a sync event.
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(tick))

const ctx = computed(() => ({
  userId: userId.value,
  now: now.value,
  mentioned: messageIndex.value.mentioned,
}))
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

// Resizable details rail. Default: a third of the thread+rail area (≈ the
// thread at 75 % of its old width, the rail getting the rest), clamped so
// neither pane collapses; persisted per browser.
const RAIL_MIN = 300
const RAIL_MAX = 760
const detailsWidth = ref(0)
const splitArea = ref(null) // thread + rail container
function defaultRailWidth() {
  const total = splitArea.value?.clientWidth || 1100
  return Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, total * 0.34)))
}
onMounted(() => {
  let saved = 0
  try {
    saved = Number(localStorage.getItem('desk:railWidth')) || 0
  } catch {
    /* ignore */
  }
  detailsWidth.value = saved ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, saved)) : defaultRailWidth()
})
const resizing = ref(false)
function startResize(e) {
  e.preventDefault()
  resizing.value = true
  const area = splitArea.value
  function onMove(ev) {
    if (!area) return
    const right = area.getBoundingClientRect().right
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX
    const max = Math.min(RAIL_MAX, area.clientWidth - 360) // keep ≥ 360px for the thread
    detailsWidth.value = Math.round(Math.min(max, Math.max(RAIL_MIN, right - x)))
  }
  function onUp() {
    resizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onUp)
    try {
      localStorage.setItem('desk:railWidth', String(detailsWidth.value))
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', onUp)
}
function resetResize() {
  detailsWidth.value = defaultRailWidth()
  try {
    localStorage.removeItem('desk:railWidth')
  } catch {
    /* ignore */
  }
}

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

    <!-- Thread + details (resizable split) -->
    <div
      v-if="conversationId"
      ref="splitArea"
      class="tw:flex tw:min-w-0 tw:flex-1"
      :class="resizing ? 'tw:select-none tw:cursor-col-resize' : ''"
    >
      <SupportDeskThread
        v-show="!isNarrow || conversationId"
        :key="conversationId"
        :conversationId="conversationId"
        :detailsOpen="detailsOpen"
        :showBack="isNarrow"
        @toggleDetails="detailsOpen = !detailsOpen"
        @back="closeConversation"
      />
      <template v-if="detailsOpen && !isNarrow">
        <!-- Drag handle: resizes the details rail; double-click resets. -->
        <div
          class="tw:group tw:relative tw:z-10 tw:-mx-1 tw:w-2 tw:shrink-0 tw:cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize details panel"
          tabindex="0"
          @mousedown="startResize"
          @touchstart="startResize"
          @dblclick="resetResize"
          @keydown.left.prevent="detailsWidth = Math.min(RAIL_MAX, detailsWidth + 24)"
          @keydown.right.prevent="detailsWidth = Math.max(RAIL_MIN, detailsWidth - 24)"
        >
          <div
            class="tw:absolute tw:inset-y-0 tw:left-1/2 tw:w-px tw:-translate-x-1/2 tw:bg-divider tw:transition-colors tw:group-hover:w-0.5 tw:group-hover:bg-primary"
            :class="resizing ? 'tw:w-0.5 tw:bg-primary' : ''"
          />
        </div>
        <SupportDeskDetails
          :conversationId="conversationId"
          :style="{ width: detailsWidth ? detailsWidth + 'px' : undefined }"
          @close="detailsOpen = false"
          @openConversation="openConversation"
        />
      </template>
    </div>
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
