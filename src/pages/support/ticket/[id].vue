<script setup>
import {
  IconMail,
  IconUserCircle,
  IconSend,
  IconStar,
  IconStarFilled,
  IconAlertTriangle,
} from '@tabler/icons-vue'
// Public token page — no session. Same pattern as /support/[slug].
import { get, post } from '@/api'

const route = useRoute()
const complaintId = computed(() => route.params.id)
const token = computed(() => route.query.token)

const loading = ref(true)
const loadError = ref(null)
const ticket = ref(null)

async function load() {
  loading.value = true
  try {
    const data = await get(
      `/v1/services/public/complaintStatus/${complaintId.value}?token=${encodeURIComponent(token.value ?? '')}`,
      { showError: false },
    )
    ticket.value = data.ticket
  } catch {
    loadError.value = 'This ticket link is not valid. Check the link in your email.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const STATUS_LABELS = {
  NEW: 'Open',
  OPEN: 'Open',
  ASSIGNED: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_CUSTOMER: 'Waiting for your reply',
  ON_HOLD: 'On hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CONVERTED_TO_NC: 'Closed',
}

const statusLabel = computed(() => STATUS_LABELS[ticket.value?.statusId] ?? 'Open')
const isClosedLike = computed(() =>
  ['RESOLVED', 'CLOSED', 'CONVERTED_TO_NC'].includes(ticket.value?.statusId),
)

// ── Reply ──
const replyText = ref('')
const sending = ref(false)
const replyError = ref(null)

async function sendReply() {
  const body = replyText.value.trim()
  if (!body || sending.value) return
  sending.value = true
  replyError.value = null
  try {
    await post(
      `/v1/services/public/complaintStatus/${complaintId.value}/reply?token=${encodeURIComponent(token.value ?? '')}`,
      { body },
      { showError: false },
    )
    replyText.value = ''
    await load()
  } catch (e) {
    replyError.value = e.message || 'Could not send your reply — please try again.'
  } finally {
    sending.value = false
  }
}

// ── CSAT (?rate=1 from the satisfaction email opens the rating box) ──
const showRating = ref(false)
const ratingHover = ref(0)
const ratingValue = ref(0)
const ratingComment = ref('')
const ratingBusy = ref(false)
const ratingDone = ref(false)
const ratingError = ref(null)

onMounted(() => {
  if (route.query.rate) showRating.value = true
})

async function submitRating() {
  if (!ratingValue.value || ratingBusy.value) return
  ratingBusy.value = true
  ratingError.value = null
  try {
    await post(
      `/v1/services/public/complaintCsat/${complaintId.value}?token=${encodeURIComponent(token.value ?? '')}`,
      { rating: ratingValue.value, comment: ratingComment.value.trim() || null },
      { showError: false },
    )
    ratingDone.value = true
  } catch (e) {
    ratingError.value = e.message || 'Could not save your rating.'
  } finally {
    ratingBusy.value = false
  }
}
</script>

<template>
  <!-- h-screen + overflow-y-auto, not min-h-screen: the app shell locks the
       body (overflow-hidden) and sizes #app to the viewport, so this public
       page must own its own vertical scroll or the conversation's latest
       messages + reply box get clipped and become unreachable. -->
  <div class="tw:h-screen tw:overflow-y-auto tw:bg-gray-50 tw:py-10 tw:px-4">
    <div class="tw:max-w-2xl tw:mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="tw:flex tw:justify-center tw:py-20">
        <BaseSpinner size="md" />
      </div>

      <!-- Bad / expired link -->
      <div
        v-else-if="loadError"
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-10 tw:text-center"
      >
        <IconAlertTriangle :size="40" class="tw:text-amber-500 tw:mx-auto tw:mb-3" />
        <p class="tw:text-sm tw:text-secondary">{{ loadError }}</p>
      </div>

      <template v-else-if="ticket">
        <!-- Header -->
        <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-6 tw:mb-4">
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
            <div class="tw:min-w-0">
              <div class="tw:text-xs tw:text-secondary">
                {{ ticket.complaintNumber }}
                <template v-if="ticket.companyName">· {{ ticket.companyName }} Support</template>
              </div>
              <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main tw:mt-1">
                {{ ticket.subject }}
              </h1>
              <div class="tw:text-xs tw:text-secondary tw:mt-1">
                Opened {{ ticket.createdAt?.formatDate?.('datetime') ?? '' }}
              </div>
            </div>
            <span
              class="tw:shrink-0 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold"
              :class="
                isClosedLike
                  ? 'tw:bg-green-100 tw:text-green-700'
                  : 'tw:bg-blue-100 tw:text-blue-700'
              "
            >
              {{ statusLabel }}
            </span>
          </div>
        </div>

        <!-- CSAT -->
        <div
          v-if="showRating && !ticket.csatRating && !ratingDone"
          class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-6 tw:mb-4"
        >
          <div class="tw:text-sm tw:font-semibold tw:mb-2">How did we do?</div>
          <div class="tw:flex tw:gap-1 tw:mb-3">
            <button
              v-for="star in 5"
              :key="star"
              class="tw:text-amber-400"
              @mouseenter="ratingHover = star"
              @mouseleave="ratingHover = 0"
              @click="ratingValue = star"
            >
              <component
                :is="star <= (ratingHover || ratingValue) ? IconStarFilled : IconStar"
                :size="28"
              />
            </button>
          </div>
          <textarea
            v-model="ratingComment"
            rows="2"
            placeholder="Anything you'd like to add? (optional)"
            class="tw:w-full tw:border tw:border-divider tw:rounded-lg tw:p-2 tw:text-sm tw:mb-3"
          />
          <p v-if="ratingError" class="tw:text-xs tw:text-red-600 tw:mb-2">{{ ratingError }}</p>
          <button
            class="tw:bg-blue-600 tw:text-white tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm tw:font-semibold tw:disabled:opacity-50"
            :disabled="!ratingValue || ratingBusy"
            @click="submitRating"
          >
            {{ ratingBusy ? 'Submitting…' : 'Submit Rating' }}
          </button>
        </div>
        <div
          v-else-if="(showRating && ticket.csatRating) || ratingDone"
          class="tw:bg-green-50 tw:border tw:border-green-200 tw:rounded-xl tw:p-4 tw:mb-4 tw:text-sm tw:text-green-800"
        >
          Thank you for your feedback!
        </div>

        <!-- Conversation -->
        <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-6">
          <div class="tw:text-sm tw:font-semibold tw:mb-4">Conversation</div>
          <div class="tw:flex tw:flex-col tw:gap-4">
            <div
              v-for="(message, index) in ticket.messages"
              :key="index"
              class="tw:max-w-[85%]"
              :class="message.direction === 'INBOUND' ? 'tw:self-end' : 'tw:self-start'"
            >
              <div
                class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-1"
              >
                <component
                  :is="message.direction === 'OUTBOUND' ? IconUserCircle : IconMail"
                  :size="14"
                />
                <span class="tw:font-medium">{{ message.senderName }}</span>
                <span>·</span>
                <span>{{ message.createdAt?.formatDate?.('datetime') ?? '' }}</span>
              </div>
              <div
                class="tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed tw:whitespace-pre-wrap"
                :class="
                  message.direction === 'OUTBOUND'
                    ? 'tw:bg-blue-50 tw:text-blue-900 tw:border tw:border-blue-100'
                    : 'tw:bg-gray-100 tw:text-on-main tw:border tw:border-divider'
                "
              >
                {{ message.body }}
              </div>
            </div>
            <p
              v-if="!ticket.messages?.length"
              class="tw:text-sm tw:text-secondary tw:italic tw:text-center tw:py-4"
            >
              No replies yet — our team will get back to you soon.
            </p>
          </div>

          <!-- Reply -->
          <div class="tw:mt-5 tw:pt-4 tw:border-t tw:border-divider">
            <textarea
              v-model="replyText"
              rows="3"
              placeholder="Add a reply…"
              class="tw:w-full tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:text-sm"
            />
            <p v-if="replyError" class="tw:text-xs tw:text-red-600 tw:mt-1">{{ replyError }}</p>
            <div class="tw:flex tw:justify-end tw:mt-2">
              <button
                class="tw:inline-flex tw:items-center tw:gap-1 tw:bg-blue-600 tw:text-white tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm tw:font-semibold tw:disabled:opacity-50"
                :disabled="!replyText.trim() || sending"
                @click="sendReply"
              >
                <IconSend :size="15" />
                {{ sending ? 'Sending…' : 'Send Reply' }}
              </button>
            </div>
          </div>
        </div>

        <p class="tw:text-center tw:text-xs tw:text-gray-400 tw:mt-6">Powered by Qability</p>
      </template>
    </div>
  </div>
</template>
