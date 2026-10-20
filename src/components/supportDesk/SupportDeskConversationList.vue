<script setup>
import {
  IconSearch,
  IconMenu2,
  IconChevronDown,
  IconArrowsSort,
  IconX,
  IconMessageCircle,
  IconMail,
  IconForms,
  IconPhone,
} from '@tabler/icons-vue'
import { DESK_VIEWS, parseView, awaitingAgent, lastActivityMs } from './deskViews.js'

const props = defineProps({
  view: { type: String, required: true },
  brands: { type: Array, default: () => [] },
  conversations: { type: Array, default: () => [] },
  lastMessages: { type: Map, default: () => new Map() },
  selectedId: { type: String, default: null },
  lifecycleAgnostic: { type: Boolean, default: false },
  now: { type: Number, default: () => Date.now() },
  showMenuButton: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'menu'])
const status = defineModel('status', { type: String, default: 'open' })
const search = defineModel('search', { type: String, default: '' })
const sort = defineModel('sort', { type: String, default: 'activity' })

const title = computed(() => {
  const v = parseView(props.view)
  if (v.kind === 'brand') return props.brands.find((b) => b.id === v.brandId)?.name || 'Brand'
  return DESK_VIEWS.find((d) => d.id === v.id)?.label || 'Inbox'
})

const STATUS_OPTIONS = [
  { id: 'open', name: 'Open' },
  { id: 'closed', name: 'Closed' },
  { id: 'all', name: 'All' },
]
const statusMenu = computed(() =>
  STATUS_OPTIONS.map((o) => ({ name: o.name, click: () => (status.value = o.id) })),
)
const statusLabel = computed(() => STATUS_OPTIONS.find((o) => o.id === status.value)?.name)

const SORT_OPTIONS = [
  { id: 'activity', name: 'Last activity' },
  { id: 'waiting', name: 'Waiting longest' },
  { id: 'newest', name: 'Newest' },
  { id: 'oldest', name: 'Oldest' },
]
const sortMenu = computed(() =>
  SORT_OPTIONS.map((o) => ({ name: o.name, click: () => (sort.value = o.id) })),
)
const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.id === sort.value)?.name)

const searching = ref(false)
const searchInput = ref(null)
async function openSearch() {
  searching.value = true
  await nextTick()
  searchInput.value?.focus?.()
}
function closeSearch() {
  searching.value = false
  search.value = ''
}

// ── Row helpers ─────────────────────────────────────────────────────────────
function displayName(r) {
  return r.customerName || r.customerEmail || r.customerCompany || 'Visitor'
}
function preview(r) {
  const m = props.lastMessages.get(r.id)
  if (!m) return r.description || r.subject || ''
  const who = m.direction === 'OUTBOUND' ? (m.senderName?.split(' ')[0] ?? 'You') + ': ' : ''
  const body = (m.body || '').replace(/\s+/g, ' ').trim()
  return who + body
}
function isNote(r) {
  return props.lastMessages.get(r.id)?.kind === 'INTERNAL_NOTE'
}
function age(r) {
  const ms = lastActivityMs(r)
  if (!ms) return ''
  const diff = Math.max(0, props.now - ms)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  return `${Math.floor(d / 30)}mo`
}
function channelIcon(r) {
  if (r.channelKind === 'CHAT') return IconMessageCircle
  if (r.channelKind === 'FORM') return IconForms
  if (r.channelKind === 'PHONE') return IconPhone
  return IconMail
}
function visitorOnline(r) {
  const t = r.visitorLastSeenAt
  return !!t && props.now - (t.toMillis ? t.toMillis() : new Date(t).getTime()) < 120_000
}
function brandOf(r) {
  return props.brands.length > 1 ? props.brands.find((b) => b.id === r.brandId) : null
}

// Keep the selected row in view when j/k move the selection.
const listEl = ref(null)
watch(
  () => props.selectedId,
  async (id) => {
    if (!id) return
    await nextTick()
    listEl.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' })
  },
)
</script>

<template>
  <section
    class="tw:flex tw:h-full tw:w-full tw:lg:w-[22rem] tw:xl:w-[24rem] tw:shrink-0 tw:flex-col tw:border-r tw:border-divider tw:bg-main"
  >
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:pt-3 tw:pb-2">
      <button
        v-if="showMenuButton"
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        aria-label="Open menu"
        @click="emit('menu')"
      >
        <IconMenu2 :size="18" />
      </button>
      <template v-if="searching">
        <div class="tw:relative tw:flex-1">
          <IconSearch
            :size="14"
            class="tw:absolute tw:left-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
          />
          <input
            ref="searchInput"
            v-model="search"
            type="search"
            placeholder="Search name, email, subject, #"
            class="tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-1 tw:pl-7 tw:pr-7 tw:text-sm tw:outline-none tw:focus:border-primary"
            @keydown.esc="closeSearch"
          />
          <button
            class="tw:absolute tw:right-1.5 tw:top-1/2 tw:-translate-y-1/2 tw:rounded tw:p-0.5 tw:text-secondary tw:hover:bg-main-hover"
            aria-label="Close search"
            @click="closeSearch"
          >
            <IconX :size="14" />
          </button>
        </div>
      </template>
      <template v-else>
        <BaseHeading :level="1" class="tw:flex-1 tw:truncate tw:text-base tw:font-semibold">{{
          title
        }}</BaseHeading>
        <button
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          aria-label="Search"
          @click="openSearch"
        >
          <IconSearch :size="18" />
        </button>
      </template>
    </div>

    <!-- Status + sort row -->
    <div
      class="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-divider tw:px-3 tw:pb-2 tw:text-xs"
    >
      <BaseMenu v-if="!lifecycleAgnostic" :items="statusMenu">
        <template #trigger>
          <button
            class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:px-1 tw:py-0.5 tw:font-medium tw:text-on-main tw:hover:bg-main-hover"
          >
            {{ conversations.length }} {{ statusLabel }}
            <IconChevronDown :size="12" class="tw:text-secondary" />
          </button>
        </template>
      </BaseMenu>
      <span v-else class="tw:px-1 tw:font-medium">{{ conversations.length }}</span>
      <BaseMenu :items="sortMenu">
        <template #trigger>
          <button
            class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:px-1 tw:py-0.5 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          >
            {{ sortLabel }}
            <IconArrowsSort :size="12" />
          </button>
        </template>
      </BaseMenu>
    </div>

    <!-- Rows -->
    <div ref="listEl" class="tw:flex-1 tw:overflow-y-auto">
      <div
        v-if="!conversations.length"
        class="tw:px-6 tw:py-12 tw:text-center tw:text-sm tw:text-secondary"
      >
        {{ search ? 'Nothing matches your search.' : 'Nothing here — inbox zero.' }}
      </div>
      <ul v-else class="tw:flex tw:flex-col tw:p-1.5 tw:gap-0.5">
        <li v-for="r in conversations" :key="r.id" :data-id="r.id">
          <BaseClickableRow
            :aria-label="`Open conversation with ${displayName(r)}`"
            class="tw:group tw:flex tw:w-full tw:gap-2.5 tw:rounded-lg tw:px-2.5 tw:py-2 tw:text-left tw:transition-colors"
            :class="r.id === selectedId ? 'tw:bg-main-selected' : 'tw:hover:bg-main-hover'"
            @click="emit('select', r.id)"
          >
            <!-- Avatar + presence/channel -->
            <div class="tw:relative tw:shrink-0 tw:pt-0.5">
              <BaseAvatar :name="displayName(r)" size="sm" />
              <span
                class="tw:absolute tw:-bottom-0.5 tw:-right-0.5 tw:flex tw:h-4 tw:w-4 tw:items-center tw:justify-center tw:rounded-full tw:bg-card tw:text-secondary tw:ring-1 tw:ring-divider"
              >
                <component :is="channelIcon(r)" :size="10" />
              </span>
              <span
                v-if="r.channelKind === 'CHAT' && visitorOnline(r)"
                class="tw:absolute tw:-top-0.5 tw:-right-0.5 tw:h-2.5 tw:w-2.5 tw:rounded-full tw:bg-green-500 tw:ring-2 tw:ring-card"
                title="Visitor online"
              />
            </div>

            <div class="tw:min-w-0 tw:flex-1">
              <div class="tw:flex tw:items-baseline tw:gap-2">
                <span
                  class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm"
                  :class="awaitingAgent(r) ? 'tw:font-semibold tw:text-on-main' : 'tw:text-on-main'"
                >
                  {{ displayName(r) }}
                </span>
                <span class="tw:shrink-0 tw:text-xs tw:tabular-nums tw:text-secondary">
                  {{ age(r) }}
                </span>
              </div>
              <div class="tw:truncate tw:text-xs tw:text-secondary">
                <span class="tw:text-on-main/70">{{ r.complaintNumber }}</span>
                <template v-if="r.subject"> · {{ r.subject }}</template>
              </div>
              <div
                class="tw:truncate tw:text-xs"
                :class="
                  isNote(r)
                    ? 'tw:text-amber-700'
                    : awaitingAgent(r)
                      ? 'tw:text-on-main'
                      : 'tw:text-secondary'
                "
              >
                {{ preview(r) }}
              </div>
              <div
                v-if="brandOf(r) || r.priorityId === 'URGENT' || r.priorityId === 'HIGH'"
                class="tw:mt-1 tw:flex tw:items-center tw:gap-1.5"
              >
                <span
                  v-if="brandOf(r)"
                  class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-main-hover tw:px-1.5 tw:py-0.5 tw:text-micro tw:text-secondary"
                >
                  <span
                    class="tw:inline-block tw:h-1.5 tw:w-1.5 tw:rounded-full"
                    :style="{ background: brandOf(r).accentColor || '#1f6feb' }"
                  />
                  {{ brandOf(r).name }}
                </span>
                <CustomerComplaintPriorityBadgeById
                  v-if="r.priorityId === 'URGENT' || r.priorityId === 'HIGH'"
                  :priorityId="r.priorityId"
                  class="tw:text-micro"
                />
              </div>
            </div>

            <!-- Assignee -->
            <div class="tw:shrink-0 tw:self-center">
              <SupportDeskAssigneeAvatar :userId="r.assignedTo" />
            </div>
          </BaseClickableRow>
        </li>
      </ul>
    </div>
  </section>
</template>
