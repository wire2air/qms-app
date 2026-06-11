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

const replyBody = ref('')
const sending = ref(false)

async function sendReply() {
  const body = replyBody.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    await post(`/v1/services/customerComplaints/${props.complaintId}/reply`, { body })
    replyBody.value = ''
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
        <div
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-1"
        >
          <component
            :is="message.direction === 'OUTBOUND' ? IconUserCircle : IconMail"
            :size="14"
          />
          <span class="tw:font-medium">{{ senderLabel(message) }}</span>
          <span>·</span>
          <span>{{ message.createdAt?.formatDate('datetime') }}</span>
        </div>
        <div
          class="tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed tw:whitespace-pre-wrap"
          :class="
            message.direction === 'OUTBOUND'
              ? 'tw:bg-blue-50 tw:text-blue-900 tw:border tw:border-blue-100'
              : 'tw:bg-gray-50 tw:text-on-main tw:border tw:border-divider'
          "
        >
          {{ message.body }}
        </div>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No messages yet.</div>

    <!-- Reply box -->
    <div v-if="canReply" class="tw:mt-4 tw:pt-4 tw:border-t tw:border-divider">
      <BaseTextarea
        v-model="replyBody"
        :rows="3"
        :placeholder="
          customerEmail
            ? `Reply to ${customerEmail}…`
            : 'Add a customer email on this complaint to reply…'
        "
        :disabled="!customerEmail || sending"
      />
      <div class="tw:flex tw:justify-end tw:mt-2">
        <BaseButton
          variant="primary"
          :disabled="!customerEmail || !replyBody.trim() || sending"
          @click="sendReply"
        >
          <IconSend :size="16" class="tw:mr-1" />
          {{ sending ? 'Sending…' : 'Send Reply' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
