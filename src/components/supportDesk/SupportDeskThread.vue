<script setup>
import {
  IconArrowLeft,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconExternalLink,
  IconLock,
  IconCheck,
  IconChecks,
  IconRobot,
  IconInfoCircle,
  IconAt,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useSupportTicketActions } from '@/composables/useSupportTicketActions.js'
import { useChatLive } from '@/composables/useChatLive.js'

/**
 * The middle pane: one conversation as chat bubbles (customer left, agents
 * right, notes as sticky-notes, system/auto lines centred), the action bar on
 * top and the composer below. Actions come from useSupportTicketActions so
 * they match the classic ticket page verb for verb.
 */
const props = defineProps({
  conversationId: { type: String, required: true },
  detailsOpen: { type: Boolean, default: true },
  showBack: { type: Boolean, default: false },
})
const emit = defineEmits(['toggleDetails', 'back'])
const router = useRouter()

const complaint = useLiveQueryWithDeps(
  [() => props.conversationId],
  async (db, [id]) => db.CustomerComplaint.findByPk(id),
  { models: ['CustomerComplaint'] },
)
const messages = useLiveQueryWithDeps(
  [() => props.conversationId],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.CustomerComplaintMessage.where('complaintId', id).exec()
    return rows
      .filter((m) => m.kind !== 'QA_NOTE')
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['CustomerComplaintMessage'], initial: [] },
)

// The brand's automated widget lines (welcome / away / rating prompts…) are
// what the VISITOR saw; agents rarely need them. Hidden by default, one click
// away. Agent-spoken AUTO lines (outbound greetings) and SYSTEM events
// (assigned, taken over, ended) always show.
const showAuto = ref(false)
try {
  showAuto.value = localStorage.getItem('desk:showAuto') === '1'
} catch {
  /* ignore */
}
watch(showAuto, (v) => {
  try {
    localStorage.setItem('desk:showAuto', v ? '1' : '0')
  } catch {
    /* ignore */
  }
})
const hiddenAutoCount = computed(
  () => messages.value.filter((m) => m.kind === 'AUTO' && m.senderKind !== 'AGENT').length,
)
const visibleMessages = computed(() =>
  showAuto.value
    ? messages.value
    : messages.value.filter((m) => m.kind !== 'AUTO' || m.senderKind === 'AGENT'),
)

const ticket = useSupportTicketActions(complaint, {
  onConverted: (ncId) => router.push(getCompanyPath(`/nonconformances/${ncId}`)),
})

const displayName = computed(
  () =>
    complaint.value?.customerName ||
    complaint.value?.customerEmail ||
    complaint.value?.customerCompany ||
    'Visitor',
)

// Visitor presence for live chats (widget polls every 3 s; 2 min grace).
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 15_000)
onBeforeUnmount(() => clearInterval(tick))
// Live socket presence wins when known; otherwise fall back to last-seen.
const isLiveChat = computed(
  () => complaint.value?.channelKind === 'CHAT' && complaint.value?.chatState !== 'ENDED',
)
const { visitorTyping, visitorOnlineLive, sendTyping } = useChatLive(
  computed(() => props.conversationId),
  isLiveChat,
)
const visitorOnline = computed(() => {
  if (visitorOnlineLive.value !== null) return visitorOnlineLive.value
  const t = complaint.value?.visitorLastSeenAt
  return !!t && now.value - (t.toMillis ? t.toMillis() : new Date(t).getTime()) < 120_000
})
watch(visitorTyping, async (on) => {
  if (!on) return
  await nextTick()
  if (pinned.value && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
})

// ── Bubble helpers ──────────────────────────────────────────────────────────
function kindOf(m) {
  if (m.kind === 'INTERNAL_NOTE') return 'note'
  // An outbound (proactive) greeting is AUTO but spoken by an agent — a bubble.
  if (m.kind === 'AUTO' && m.senderKind === 'AGENT') return 'agent'
  if (m.kind === 'SYSTEM' || m.kind === 'AUTO') return 'system'
  return m.direction === 'OUTBOUND' ? 'agent' : 'customer'
}
function sender(m) {
  if (m.direction === 'OUTBOUND') return m.senderName || 'Agent'
  return m.senderName || m.senderEmail || displayName.value
}
// Agent-authored HTML comes from our own editor; customer HTML never renders raw.
function trustedHtml(m) {
  return m.direction === 'OUTBOUND' && m.bodyHtml ? m.bodyHtml : null
}
function seenState(m) {
  if (m.direction !== 'OUTBOUND' || complaint.value?.channelKind !== 'CHAT') return null
  if (m.readAt) return 'seen'
  if (m.deliveredAt) return 'delivered'
  return 'sent'
}
// Group consecutive messages by the same sender within 5 minutes — one header.
function startsGroup(i) {
  const m = visibleMessages.value[i]
  const p = visibleMessages.value[i - 1]
  if (!p) return true
  if (kindOf(p) !== kindOf(m) || p.senderName !== m.senderName) return true
  return (m.createdAt?.toMillis?.() ?? 0) - (p.createdAt?.toMillis?.() ?? 0) > 5 * 60_000
}
function dayLabel(i) {
  const m = visibleMessages.value[i]
  const p = visibleMessages.value[i - 1]
  const d = m.createdAt
  if (!d?.hasSame) return null
  if (p?.createdAt?.hasSame?.(d, 'day')) return null
  return d.formatDate('date')
}

// Stick to the bottom as messages arrive (unless the agent scrolled up).
const scroller = ref(null)
const pinned = ref(true)
function onScroll() {
  const el = scroller.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (pinned.value && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <section class="tw:flex tw:h-full tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-main tw:p-3 tw:pr-2">
    <div
      class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-sm"
    >
      <!-- Header -->
      <header
        class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-3 tw:py-2"
      >
        <button
          v-if="showBack"
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
          aria-label="Back to list"
          @click="emit('back')"
        >
          <IconArrowLeft :size="18" />
        </button>
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:items-center tw:gap-2">
            <h2 class="tw:truncate tw:text-sm tw:font-semibold">{{ displayName }}</h2>
            <template v-if="complaint?.channelKind === 'CHAT'">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro"
                :class="visitorOnline ? 'tw:text-green-700' : 'tw:text-secondary'"
              >
                <span
                  class="tw:inline-block tw:h-2 tw:w-2 tw:rounded-full"
                  :class="visitorOnline ? 'tw:bg-green-500' : 'tw:bg-gray-400'"
                />
                {{ visitorOnline ? 'online' : 'away' }}
              </span>
            </template>
            <CustomerComplaintStatusBadgeById
              v-if="complaint"
              :statusId="complaint.statusId"
              class="tw:text-micro"
            />
          </div>
          <div class="tw:truncate tw:text-xs tw:text-secondary">
            <span>{{ complaint?.complaintNumber }}</span>
            <template v-if="complaint?.subject"> · {{ complaint.subject }}</template>
          </div>
        </div>

        <DetailActionBar v-if="complaint" :actions="ticket.actions" :maxVisible="2" />
        <BaseTooltip
          v-if="hiddenAutoCount || showAuto"
          :content="
            showAuto
              ? 'Hide automated widget messages'
              : `Show ${hiddenAutoCount} automated widget message${hiddenAutoCount === 1 ? '' : 's'}`
          "
        >
          <button
            class="tw:rounded-md tw:p-1 tw:hover:bg-main-hover"
            :class="showAuto ? 'tw:text-primary' : 'tw:text-secondary tw:hover:text-on-main'"
            :aria-pressed="showAuto"
            aria-label="Toggle automated messages"
            @click="showAuto = !showAuto"
          >
            <IconRobot :size="18" />
          </button>
        </BaseTooltip>
        <BaseTooltip content="Open in ticket view">
          <RouterLink
            v-if="complaint"
            :to="getCompanyPath(`/customer-complaints/${complaint.id}`)"
            class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
            aria-label="Open in ticket view"
          >
            <IconExternalLink :size="18" />
          </RouterLink>
        </BaseTooltip>
        <BaseTooltip :content="detailsOpen ? 'Hide details' : 'Show details'">
          <button
            class="tw:hidden tw:lg:block tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
            :aria-label="detailsOpen ? 'Hide details' : 'Show details'"
            @click="emit('toggleDetails')"
          >
            <component
              :is="detailsOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRightExpand"
              :size="18"
            />
          </button>
        </BaseTooltip>
      </header>

      <!-- Banners -->
      <div
        v-if="complaint?.isSpam"
        class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-red-200 tw:bg-red-50 tw:px-4 tw:py-1.5 tw:text-xs tw:text-red-700"
      >
        <IconInfoCircle :size="14" />
        In the Spam box. Replies are disabled — use “Not spam” to restore it.
      </div>
      <div
        v-else-if="ticket.isSnoozed"
        class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-amber-200 tw:bg-amber-50 tw:px-4 tw:py-1.5 tw:text-xs tw:text-amber-800"
      >
        <IconInfoCircle :size="14" />
        Snoozed until {{ ticket.snoozedUntilLabel }} — a customer reply wakes it early.
      </div>
      <div
        v-else-if="complaint && ticket.isTerminal"
        class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-main-hover tw:px-4 tw:py-1.5 tw:text-xs tw:text-secondary"
      >
        <IconInfoCircle :size="14" />
        This conversation is
        {{ complaint.statusId === 'CONVERTED_TO_NC' ? 'converted to an NC' : 'closed' }}. A customer
        reply reopens it.
      </div>

      <!-- Messages -->
      <div
        ref="scroller"
        class="tw:flex-1 tw:overflow-y-auto tw:px-4 tw:py-4"
        @scroll.passive="onScroll"
      >
        <div v-if="complaint === undefined" class="tw:flex tw:justify-center tw:py-10">
          <BaseSpinner />
        </div>
        <div
          v-else-if="complaint === null"
          class="tw:py-10 tw:text-center tw:text-sm tw:text-secondary"
        >
          This conversation no longer exists.
        </div>
        <template v-else>
          <!-- Ticket intro: subject + description as the first "message" -->
          <div
            v-if="complaint.description && !messages.length"
            class="tw:mx-auto tw:mb-4 tw:max-w-2xl tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-3 tw:text-sm"
          >
            <div class="tw:mb-1 tw:text-xs tw:font-semibold tw:text-secondary">
              {{ complaint.subject }}
            </div>
            <p class="tw:whitespace-pre-wrap">{{ complaint.description }}</p>
          </div>

          <div class="tw:mx-auto tw:flex tw:max-w-3xl tw:flex-col tw:gap-1">
            <template v-for="(m, i) in visibleMessages" :key="m.id">
              <div v-if="dayLabel(i)" class="tw:my-3 tw:flex tw:items-center tw:gap-3">
                <span class="tw:h-px tw:flex-1 tw:bg-divider" />
                <span
                  class="tw:text-micro tw:font-medium tw:uppercase tw:tracking-wide tw:text-secondary"
                >
                  {{ dayLabel(i) }}
                </span>
                <span class="tw:h-px tw:flex-1 tw:bg-divider" />
              </div>

              <!-- System / auto line -->
              <div v-if="kindOf(m) === 'system'" class="tw:my-1 tw:flex tw:justify-center">
                <span
                  class="tw:inline-flex tw:max-w-[80%] tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-main-hover tw:px-3 tw:py-1 tw:text-micro tw:text-secondary"
                  :title="m.createdAt?.formatDate('datetime')"
                >
                  <IconRobot v-if="m.kind === 'AUTO'" :size="12" />
                  {{ m.body }}
                </span>
              </div>

              <!-- Bubble -->
              <div
                v-else
                class="tw:flex tw:flex-col"
                :class="[
                  kindOf(m) === 'customer' ? 'tw:items-start' : 'tw:items-end',
                  startsGroup(i) ? 'tw:mt-3' : '',
                ]"
              >
                <div
                  v-if="startsGroup(i)"
                  class="tw:mb-1 tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary"
                >
                  <IconLock v-if="kindOf(m) === 'note'" :size="12" />
                  <span class="tw:font-medium">{{ sender(m) }}</span>
                  <span v-if="kindOf(m) === 'note'" class="tw:text-amber-700">· internal note</span>
                </div>
                <div
                  class="tw:max-w-[85%] tw:rounded-2xl tw:px-3.5 tw:py-2 tw:text-sm tw:leading-relaxed"
                  :class="
                    kindOf(m) === 'note'
                      ? 'tw:rounded-tr-md tw:border tw:border-amber-200 tw:bg-amber-50 tw:text-amber-900'
                      : kindOf(m) === 'agent'
                        ? 'tw:rounded-tr-md tw:bg-blue-600 tw:text-white'
                        : 'tw:rounded-tl-md tw:bg-main tw:border tw:border-divider tw:text-on-main'
                  "
                  :title="m.createdAt?.formatDate('datetime')"
                >
                  <div
                    v-if="trustedHtml(m)"
                    class="desk-bubble-html tw:prose tw:prose-sm tw:max-w-none"
                    :class="kindOf(m) === 'agent' ? 'desk-bubble-html--inverted' : ''"
                    v-html="trustedHtml(m)"
                  />
                  <span v-else class="tw:whitespace-pre-wrap">{{ m.body }}</span>
                </div>
                <div
                  v-if="kindOf(m) === 'note' && m.mentionedUserIds?.length"
                  class="tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:text-micro tw:text-secondary"
                >
                  <IconAt :size="11" />
                  <UserBadgeById v-for="uid in m.mentionedUserIds" :key="uid" :userId="uid" />
                </div>
                <div
                  class="tw:mt-0.5 tw:flex tw:items-center tw:gap-1 tw:text-micro tw:text-secondary"
                >
                  <span>{{ m.createdAt?.formatDate('time') }}</span>
                  <template v-if="seenState(m)">
                    <IconChecks
                      v-if="seenState(m) === 'seen'"
                      :size="12"
                      class="tw:text-blue-600"
                    />
                    <IconCheck v-else :size="12" />
                    <span v-if="seenState(m) === 'seen'">Seen</span>
                  </template>
                </div>
              </div>
            </template>
            <!-- Visitor typing (live socket) -->
            <div
              v-if="visitorTyping"
              class="tw:mt-3 tw:flex tw:flex-col tw:items-start"
              aria-live="polite"
            >
              <div class="tw:mb-1 tw:text-xs tw:text-secondary">{{ displayName }} is typing…</div>
              <div
                class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-2xl tw:rounded-tl-md tw:border tw:border-divider tw:bg-main tw:px-3.5 tw:py-2.5"
              >
                <span class="desk-typing-dot" /><span class="desk-typing-dot" /><span
                  class="desk-typing-dot"
                />
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Composer -->
      <SupportDeskComposer
        v-if="complaint && ticket.isEditable && !complaint.isSpam"
        :complaint="complaint"
        :disabled="ticket.acting"
        @typing="sendTyping"
      />
      <div
        v-else-if="complaint && ticket.canUpdate && !complaint.isSpam && ticket.isTerminal"
        class="tw:flex tw:items-center tw:justify-center tw:gap-3 tw:border-t tw:border-divider tw:bg-card tw:px-4 tw:py-3 tw:text-sm tw:text-secondary"
      >
        Closed conversation.
        <BaseButton
          v-if="complaint.statusId === 'CLOSED'"
          size="sm"
          variant="outline"
          :disabled="ticket.acting"
          @click="ticket.reopen"
        >
          Reopen
        </BaseButton>
      </div>

      <SupportTicketDialogs :complaint="complaint" :ticket="ticket" />
    </div>
  </section>
</template>

<style scoped>
.desk-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--color-secondary, #6b7280);
  display: inline-block;
  animation: desk-blink 1.2s infinite ease-in-out;
}
.desk-typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.desk-typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes desk-blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
.desk-bubble-html :deep(p) {
  margin: 0;
}
.desk-bubble-html :deep(p + p) {
  margin-top: 0.5rem;
}
.desk-bubble-html--inverted :deep(*) {
  color: #fff;
}
.desk-bubble-html--inverted :deep(a) {
  text-decoration: underline;
}
</style>
