<script setup>
import { uploadSupportEditorImage } from '@/composables/useSupportFileUpload'
import { IconSend, IconLock, IconMessageCircle, IconMail, IconAt } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

/**
 * Inbox composer: Reply ↔ Note, rich text, canned responses, ⌘/Ctrl+Enter to
 * send. Posts through the same /reply RPC the classic ticket page uses, so a
 * reply from here emails / pushes to the widget exactly as it does there.
 */
const props = defineProps({
  complaint: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['typing'])
const toast = useToast()
const mode = ref('PUBLIC_REPLY')
const html = ref('')
// Teammates to @mention on an internal note — they get a notification and the
// ticket shows in their Mentions view.
const mentionIds = ref([])
const sending = ref(false)
const editorRef = ref(null)

const isChat = computed(
  () => props.complaint.channelKind === 'CHAT' && props.complaint.chatState !== 'ENDED',
)
const canPublicReply = computed(() => isChat.value || !!props.complaint.customerEmail)

function plainText(h) {
  const doc = new DOMParser().parseFromString(h ?? '', 'text/html')
  return (doc.body.textContent ?? '').trim()
}
const text = computed(() => plainText(html.value))
const canSend = computed(
  () =>
    !!text.value &&
    !sending.value &&
    !props.disabled &&
    (mode.value === 'INTERNAL_NOTE' || canPublicReply.value),
)

function reset() {
  html.value = ''
  editorRef.value?.editor?.commands.clearContent()
  emit('typing', false)
}
// Typing indicator for live chats — only public replies, never notes.
watch(html, (v) => {
  if (isChat.value && mode.value === 'PUBLIC_REPLY') emit('typing', !!plainText(v))
})
watch(mode, (m) => {
  if (m !== 'PUBLIC_REPLY') emit('typing', false)
})

async function send() {
  if (!canSend.value) return
  sending.value = true
  try {
    await post(`/v1/services/customerComplaints/${props.complaint.id}/reply`, {
      body: text.value,
      bodyHtml: html.value,
      kind: mode.value,
      ...(mode.value === 'INTERNAL_NOTE' && mentionIds.value.length
        ? { mentionedUserIds: mentionIds.value }
        : {}),
    })
    reset()
    mentionIds.value = []
  } catch (e) {
    toast.error(e.message || 'Failed to send')
  } finally {
    sending.value = false
  }
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    send()
  }
}

// ── Macros (canned responses) + the identity we reply with ─────────────────
function insertMacro(snippet) {
  html.value = html.value?.trim() ? `${html.value}${snippet}` : snippet
  editorRef.value?.editor?.commands.setContent(html.value)
}
const brand = useLiveQueryWithDeps(
  [() => props.complaint.brandId ?? null],
  async (db, [id]) => (id ? db.SupportBrand.findByPk(id) : null),
  { models: ['SupportBrand'], initial: null },
)
// Email tickets reply from the channel that received them (REST
// GET /customerComplaints/emailChannels is the admin list; the ticket's own
// channel is enough here) — show agents which address and brand they sign as.
const channels = ref([])
onMounted(async () => {
  if (props.complaint.channelKind === 'CHAT') return
  try {
    const { get } = await import('@/api')
    const out = await get('/v1/services/customerComplaints/emailChannels', { showError: false })
    channels.value = out.channels || out.emailChannels || []
  } catch {
    /* hint only */
  }
})
const replyFrom = computed(() => {
  const ch = channels.value.find((c) => c.id === props.complaint.channelId)
  if (!ch) return null
  return ch.publicEmail || ch.fromAddress || ch.address || ch.name || null
})

const placeholder = computed(() => {
  if (mode.value === 'INTERNAL_NOTE') return 'Internal note — only your team sees this…'
  if (isChat.value) return 'Reply in the chat…'
  if (props.complaint.customerEmail) return `Reply to ${props.complaint.customerEmail}…`
  return 'Add a customer email on this ticket to reply.'
})
</script>

<template>
  <div
    class="tw:border-t tw:border-divider tw:bg-card tw:px-4 tw:pt-2 tw:pb-3"
    @keydown="onKeydown"
  >
    <!-- Mode tabs -->
    <div class="tw:mb-2 tw:flex tw:items-center tw:gap-1 tw:text-xs">
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2.5 tw:py-1 tw:font-semibold tw:transition-colors"
        :class="
          mode === 'PUBLIC_REPLY'
            ? 'tw:bg-blue-100 tw:text-blue-700'
            : 'tw:text-secondary tw:hover:bg-main-hover'
        "
        @click="mode = 'PUBLIC_REPLY'"
      >
        <component :is="isChat ? IconMessageCircle : IconMail" :size="13" />
        {{ isChat ? 'Chat' : 'Reply' }}
      </button>
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2.5 tw:py-1 tw:font-semibold tw:transition-colors"
        :class="
          mode === 'INTERNAL_NOTE'
            ? 'tw:bg-amber-100 tw:text-amber-800'
            : 'tw:text-secondary tw:hover:bg-main-hover'
        "
        @click="mode = 'INTERNAL_NOTE'"
      >
        <IconLock :size="13" />
        Note
      </button>
      <span class="tw:ml-auto tw:text-micro tw:text-secondary">⌘↵ to send</span>
    </div>

    <div class="desk-composer" :class="mode === 'INTERNAL_NOTE' ? 'desk-composer--note' : ''">
      <!-- Keyed on mode: the editor's placeholder is fixed at mount, so a Reply ↔
           Note switch remounts it (the draft is carried in `html`). -->
      <BaseRichTextEditor
        ref="editorRef"
        :key="mode"
        v-model="html"
        :uploadImage="uploadSupportEditorImage"
        :placeholder="placeholder"
        :editable="!disabled && (mode === 'INTERNAL_NOTE' || canPublicReply)"
      />
    </div>

    <div
      v-if="mode === 'INTERNAL_NOTE'"
      class="tw:mt-2 tw:flex tw:items-center tw:gap-2 tw:text-xs"
    >
      <IconAt :size="14" class="tw:shrink-0 tw:text-secondary" />
      <div class="tw:min-w-0 tw:flex-1">
        <UserSelectMenu v-model="mentionIds" allTypes multiple placeholder="Mention a teammate…" />
      </div>
    </div>

    <div class="tw:mt-2 tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
        <SupportMacroPicker :complaint="complaint" @insert="insertMacro" />
        <span
          v-if="mode === 'PUBLIC_REPLY' && (brand || replyFrom)"
          class="tw:truncate tw:text-micro tw:text-secondary"
          :title="replyFrom ? `Sent from ${replyFrom}` : ''"
        >
          <template v-if="brand"
            >as <strong class="tw:font-medium tw:text-on-main">{{ brand.name }}</strong></template
          >
          <template v-if="replyFrom"> · from {{ replyFrom }}</template>
        </span>
      </div>
      <BaseButton
        :variant="mode === 'INTERNAL_NOTE' ? 'secondary' : 'primary'"
        size="sm"
        :disabled="!canSend"
        @click="send"
      >
        <component
          :is="mode === 'INTERNAL_NOTE' ? IconLock : IconSend"
          :size="14"
          class="tw:mr-1"
        />
        {{ sending ? 'Sending…' : mode === 'INTERNAL_NOTE' ? 'Add note' : 'Send' }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
/* Chat composer: the editor's global focus treatment, chat-sized. */
.desk-composer :deep(.tiptap-editor-wrapper) {
  border-radius: 0.75rem;
  background: var(--card);
  min-height: 0;
}
.desk-composer :deep(.rich-text-editor-content) {
  min-height: 3rem;
  max-height: 14rem;
  overflow-y: auto;
}
.desk-composer--note :deep(.tiptap-editor-wrapper) {
  border-color: #fde68a;
}
.desk-composer--note :deep(.rich-text-editor-content) {
  background-color: #fffbeb;
  color: #78350f;
}
.desk-composer--note :deep(.ProseMirror) {
  color: #78350f;
}
.desk-composer--note :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: #b45309;
}
</style>
