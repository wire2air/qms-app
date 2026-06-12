<script setup>
import { IconSend, IconMail, IconUserCircle } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  complaintId: { type: String, required: true },
  canReply: { type: Boolean, default: false },
  customerEmail: { type: String, default: null },
})

const toast = useToast()

const messages = useLiveQueryWithDeps(
  [() => props.complaintId],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    const rows = await db.CustomerComplaintMessage.where('complaintId', complaintId).exec()
    return rows.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

// Rich-text reply (BaseRichTextEditor holds HTML). The plain-text
// version is derived for storage/search and as the HTML-less email
// fallback.
const replyHtml = ref('')
const sending = ref(false)
const replyEditorRef = ref(null)

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
    })
    // Clearing via the v-model alone won't empty the editor (its cooldown +
    // falsy-content guards swallow it) — reset it through the exposed method.
    replyEditorRef.value?.clearContent()
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to send reply' })
  } finally {
    sending.value = false
  }
}

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
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      Conversation
    </div>

    <div v-if="messages.length" class="tw:flex tw:flex-col tw:gap-3">
      <div
        v-for="message in messages"
        :key="message.id"
        class="tw:flex tw:flex-col tw:max-w-[85%]"
        :class="message.direction === 'OUTBOUND' ? 'tw:self-end tw:items-end' : 'tw:items-start'"
      >
        <div class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-1">
          <component
            :is="message.direction === 'OUTBOUND' ? IconUserCircle : IconMail"
            :size="14"
          />
          <span class="tw:font-medium">{{ senderLabel(message) }}</span>
          <span>·</span>
          <span>{{ message.createdAt?.formatDate('datetime') }}</span>
        </div>
        <div
          class="tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed"
          :class="
            message.direction === 'OUTBOUND'
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
      <div v-if="customerEmail" class="cc-reply-editor">
        <BaseRichTextEditor
          ref="replyEditorRef"
          v-model="replyHtml"
          :placeholder="`Reply to ${customerEmail}…`"
        />
      </div>
      <p v-else class="tw:text-sm tw:text-secondary tw:italic">
        Add a customer email on this complaint to reply.
      </p>
      <div class="tw:flex tw:justify-end tw:mt-2">
        <BaseButton
          variant="primary"
          :disabled="!customerEmail || !replyPlainText || sending"
          @click="sendReply"
        >
          <IconSend :size="16" class="tw:mr-1" />
          {{ sending ? 'Sending…' : 'Send Reply' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cc-reply-editor :deep(.rich-text-editor-content) {
  min-height: 6rem;
  max-height: 14rem;
  overflow-y: auto;
}
</style>
