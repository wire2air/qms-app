<script setup>
/**
 * Information Requests section — drop into any entity page.
 *
 *   <InformationRequestsSection entityType="Nonconformance" :entityId="nc.id" />
 *
 * Lists every RFI attached to (entityType, entityId). Each row gives the
 * viewing user the right call to action based on their role + RFI state:
 *   - Recipient + OPEN     → "Respond"
 *   - Requester + RESPONDED → "Acknowledge"
 *   - Anyone else / CLOSED → "View"
 *
 * Triggers a generic InformationRequestDialog in the matching mode.
 */
import { IconQuestionMark, IconMessageCircle } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  // Hide the "Ask" button when the viewer can't initiate (e.g. you're the
  // entity owner — you're the recipient, not a requester).
  canAsk: { type: Boolean, default: true },
})

const currentUserId = computed(() => currentSession.value?.userId)
const route = useRoute()
const router = useRouter()

const requests = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [type, id]) => {
    if (!type || !id) return []
    const rows = await db.InformationRequest.where('[entityType+entityId]', [type, id]).exec()
    // Newest first.
    return rows.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  },
  { initial: [] },
)

const userIds = computed(() => {
  const ids = new Set()
  for (const r of requests.value) {
    if (r.requesterId) ids.add(r.requesterId)
    if (r.recipientId) ids.add(r.recipientId)
  }
  return [...ids]
})

const usersMap = useLiveQueryWithDeps(
  [() => userIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)

function userLabel(id) {
  const u = usersMap.value[id]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

// Dialog state
const showDialog = ref(false)
const dialogMode = ref('create')
const activeRfiId = ref(null)

function openAskDialog() {
  activeRfiId.value = null
  dialogMode.value = 'create'
  showDialog.value = true
}

function actionFor(rfi) {
  // What the viewing user can do with this RFI right now.
  if (rfi.statusId === 'OPEN' && rfi.recipientId === currentUserId.value) {
    return { label: 'Respond', variant: 'primary', mode: 'respond' }
  }
  if (rfi.statusId === 'RESPONDED' && rfi.requesterId === currentUserId.value) {
    return { label: 'Acknowledge', variant: 'primary', mode: 'view' }
  }
  return { label: 'View', variant: 'outline', mode: 'view' }
}

function openRfi(rfi) {
  const action = actionFor(rfi)
  activeRfiId.value = rfi.id
  dialogMode.value = action.mode
  showDialog.value = true
}

// Auto-open dialog when arriving from an RFI task (router query `?rfi=<id>`).
// Only fires when the current user is the *active* party for that thread —
// i.e. they still have something to do. If the RFI is closed or the user
// is just a bystander, we don't pop up; they can still click "View".
let lastHandledRfiId = null
watch(
  [() => route.query.rfi, requests],
  ([rfiId, rfiList]) => {
    if (!rfiId || rfiId === lastHandledRfiId) return
    const match = rfiList.find((r) => r.id === rfiId)
    if (!match) return
    const action = actionFor(match)
    const userIsActive =
      (match.statusId === 'OPEN' && match.recipientId === currentUserId.value) ||
      (match.statusId === 'RESPONDED' && match.requesterId === currentUserId.value)
    if (!userIsActive) {
      // Strip the query so a refresh doesn't keep pinging this branch.
      const { rfi: _rfi, ...rest } = route.query
      router.replace({ query: rest })
      lastHandledRfiId = rfiId
      return
    }
    lastHandledRfiId = rfiId
    activeRfiId.value = match.id
    dialogMode.value = action.mode
    showDialog.value = true
    const { rfi: _rfi, ...rest } = route.query
    router.replace({ query: rest })
  },
  { immediate: true },
)

function statusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'OPEN',
    'tw:bg-amber-100 tw:text-amber-700': statusId === 'RESPONDED',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'CLOSED',
  }
}

function statusLabel(statusId) {
  if (statusId === 'OPEN') return 'Open'
  if (statusId === 'RESPONDED') return 'Responded'
  if (statusId === 'CLOSED') return 'Closed'
  return statusId
}

function truncate(text, n = 80) {
  if (!text) return ''
  return text.length <= n ? text : `${text.slice(0, n)}…`
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div
        class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
      >
        <IconMessageCircle :size="14" />
        Information Requests
        <span
          v-if="requests.length"
          class="tw:text-[10px] tw:bg-gray-100 tw:text-gray-700 tw:px-1.5 tw:py-0.5 tw:rounded"
        >
          {{ requests.length }}
        </span>
      </div>
      <BaseButton v-if="canAsk" variant="outline" size="sm" @click="openAskDialog">
        <template #icon><IconQuestionMark :size="14" /></template>
        Ask
      </BaseButton>
    </div>

    <div v-if="requests.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="rfi in requests"
        :key="rfi.id"
        class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover tw:cursor-pointer"
        @click="openRfi(rfi)"
      >
        <div class="tw:flex tw:flex-col tw:gap-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span
              class="tw:text-[10px] tw:font-medium tw:rounded tw:px-1.5 tw:py-0.5"
              :class="statusClass(rfi.statusId)"
            >
              {{ statusLabel(rfi.statusId) }}
            </span>
            <span class="tw:text-xs tw:text-secondary">
              {{ userLabel(rfi.requesterId) }} → {{ userLabel(rfi.recipientId) }}
            </span>
          </div>
          <div class="tw:text-sm tw:text-on-main tw:truncate">
            {{ truncate(rfi.question) }}
          </div>
        </div>
        <BaseButton :variant="actionFor(rfi).variant" size="sm" @click.stop="openRfi(rfi)">
          {{ actionFor(rfi).label }}
        </BaseButton>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No information requests yet.</div>

    <InformationRequestDialog
      v-model="showDialog"
      :mode="dialogMode"
      :entityType="entityType"
      :entityId="entityId"
      :rfiId="activeRfiId"
    />
  </div>
</template>
