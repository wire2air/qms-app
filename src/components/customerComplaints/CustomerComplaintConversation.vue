<script setup>
import {
  IconSend,
  IconMail,
  IconUserCircle,
  IconMessage2,
  IconChevronDown,
  IconLock,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  complaintId: { type: String, required: true },
  canReply: { type: Boolean, default: false },
  customerEmail: { type: String, default: null },
  customerName: { type: String, default: null },
  complaintNumber: { type: String, default: null },
})

const toast = useToast()

const messages = useLiveQueryWithDeps(
  [() => props.complaintId],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    const rows = await db.CustomerComplaintMessage.where('complaintId', complaintId).exec()
    return rows.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['CustomerComplaintMessage'], initial: [] },
)

// Rich-text reply (BaseRichTextEditor holds HTML). The plain-text
// version is derived for storage/search and as the HTML-less email
// fallback.
const replyHtml = ref('')
const sending = ref(false)
// Public reply (emailed) vs internal note (agent-only, yellow).
const replyMode = ref('PUBLIC_REPLY')

function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  return (doc.body.textContent ?? '').trim()
}

const replyPlainText = computed(() => htmlToPlainText(replyHtml.value))

async function sendReply() {
  const body = replyPlainText.value
  if (!body || sending.value) return
  sending.value = true
  try {
    await post(`/v1/services/customerComplaints/${props.complaintId}/reply`, {
      body,
      bodyHtml: replyHtml.value,
      kind: replyMode.value,
    })
    replyHtml.value = ''
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to send' })
  } finally {
    sending.value = false
  }
}

function isNote(message) {
  return message.kind === 'INTERNAL_NOTE'
}

// ─── Canned responses ────────────────────────────────────────────────────────
const cannedResponses = useLiveQuery(
  async (db) => {
    const rows = await db.ComplaintCannedResponse.where().exec()
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  },

  { models: ['ComplaintCannedResponse'], initial: [] },
)

function substituteVariables(text) {
  const agent = currentSession.value
  const agentName = [agent?.firstName, agent?.lastName].filter(Boolean).join(' ') || 'Support'
  return String(text ?? '')
    .replaceAll('{{customer.name}}', props.customerName || 'there')
    .replaceAll('{{ticket.number}}', props.complaintNumber || '')
    .replaceAll('{{agent.name}}', agentName)
}

function insertCannedResponse(response) {
  const content = substituteVariables(response.bodyHtml || response.body)
  // Append to whatever the agent already typed.
  replyHtml.value = replyHtml.value?.trim() ? `${replyHtml.value}${content}` : content
}

const cannedMenuItems = computed(() =>
  cannedResponses.value.map((r) => ({
    name: r.name,
    click: () => insertCannedResponse(r),
  })),
)

function senderLabel(message) {
  if (message.direction === 'OUTBOUND') return message.senderName || 'Agent'
  return message.senderName || message.senderEmail || 'Customer'
}

// Rendered HTML is only trusted for OUTBOUND messages (agent-authored
// in our own editor). INBOUND bodyHtml comes from arbitrary customer
// email and is never rendered raw — plain text only.
function trustedHtml(message) {
  return message.direction === 'OUTBOUND' && message.bodyHtml ? message.bodyHtml : null
}
</script>

<template>
  <BaseCard>
    <BaseText variant="overline" class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4">
      Conversation
    </BaseText>

    <div v-if="messages.length" class="tw:flex tw:flex-col tw:gap-3">
      <div
        v-for="message in messages"
        :key="message.id"
        class="tw:flex tw:flex-col tw:max-w-[85%]"
        :class="message.direction === 'OUTBOUND' ? 'tw:self-end tw:items-end' : 'tw:items-start'"
      >
        <div class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-1">
          <component
            :is="
              isNote(message)
                ? IconLock
                : message.direction === 'OUTBOUND'
                  ? IconUserCircle
                  : IconMail
            "
            :size="14"
          />
          <span class="tw:font-medium">{{ senderLabel(message) }}</span>
          <BaseBadge v-if="isNote(message)" class="tw:bg-amber-100 tw:text-amber-700 tw:text-micro">
            Internal note
          </BaseBadge>
          <span>·</span>
          <span>{{ message.createdAt?.formatDate('datetime') }}</span>
        </div>
        <div
          class="tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed"
          :class="
            isNote(message)
              ? 'tw:bg-amber-50 tw:text-amber-900 tw:border tw:border-amber-200'
              : message.direction === 'OUTBOUND'
                ? 'tw:bg-blue-50 tw:text-blue-900 tw:border tw:border-blue-100'
                : 'tw:bg-gray-50 tw:text-on-main tw:border tw:border-divider'
          "
        >
          <div
            v-if="trustedHtml(message)"
            class="tw:prose tw:prose-sm tw:max-w-none"
            v-html="trustedHtml(message)"
          />
          <span v-else class="tw:whitespace-pre-wrap">{{ message.body }}</span>
        </div>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No messages yet.</div>

    <!-- Reply box -->
    <div v-if="canReply" class="tw:mt-4 tw:pt-4 tw:border-t tw:border-divider">
      <!-- Public reply ↔ internal note toggle (Zendesk pattern) -->
      <div class="tw:flex tw:gap-1 tw:mb-2">
        <button
          class="tw:px-3 tw:py-1 tw:rounded-md tw:text-xs tw:font-semibold tw:transition-colors"
          :class="
            replyMode === 'PUBLIC_REPLY'
              ? 'tw:bg-blue-100 tw:text-blue-700'
              : 'tw:text-secondary tw:hover:bg-main-hover'
          "
          @click="replyMode = 'PUBLIC_REPLY'"
        >
          Public reply
        </button>
        <button
          class="tw:px-3 tw:py-1 tw:rounded-md tw:text-xs tw:font-semibold tw:transition-colors"
          :class="
            replyMode === 'INTERNAL_NOTE'
              ? 'tw:bg-amber-100 tw:text-amber-700'
              : 'tw:text-secondary tw:hover:bg-main-hover'
          "
          @click="replyMode = 'INTERNAL_NOTE'"
        >
          Internal note
        </button>
      </div>
      <div
        v-if="customerEmail || replyMode === 'INTERNAL_NOTE'"
        class="cc-reply-editor"
        :class="replyMode === 'INTERNAL_NOTE' ? 'cc-note-editor' : ''"
      >
        <BaseRichTextEditor
          v-model="replyHtml"
          :placeholder="
            replyMode === 'INTERNAL_NOTE'
              ? 'Internal note — only your team sees this…'
              : `Reply to ${customerEmail}…`
          "
        />
      </div>
      <p v-else class="tw:text-sm tw:text-secondary tw:italic">
        Add a customer email on this complaint to reply.
      </p>
      <div class="tw:flex tw:justify-between tw:items-center tw:mt-2">
        <BaseMenu v-if="cannedMenuItems.length" :items="cannedMenuItems">
          <template #trigger>
            <BaseButton variant="outline" size="sm">
              <IconMessage2 :size="14" class="tw:mr-1" />
              Canned response
              <IconChevronDown :size="12" class="tw:ml-1" />
            </BaseButton>
          </template>
        </BaseMenu>
        <span v-else />
        <BaseButton
          variant="primary"
          :disabled="(replyMode === 'PUBLIC_REPLY' && !customerEmail) || !replyPlainText || sending"
          @click="sendReply"
        >
          <component
            :is="replyMode === 'INTERNAL_NOTE' ? IconLock : IconSend"
            :size="16"
            class="tw:mr-1"
          />
          {{ sending ? 'Saving…' : replyMode === 'INTERNAL_NOTE' ? 'Add Note' : 'Send Reply' }}
        </BaseButton>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.cc-note-editor :deep(.rich-text-editor-content) {
  background-color: #fffbeb;
}
.cc-reply-editor :deep(.rich-text-editor-content) {
  min-height: 6rem;
  max-height: 14rem;
  overflow-y: auto;
}
</style>
