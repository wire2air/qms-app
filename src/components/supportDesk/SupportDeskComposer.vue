<script setup>
import {
  IconSend,
  IconLock,
  IconMessage2,
  IconChevronDown,
  IconMessageCircle,
  IconMail,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Inbox composer: Reply ↔ Note, rich text, canned responses, ⌘/Ctrl+Enter to
 * send. Posts through the same /reply RPC the classic ticket page uses, so a
 * reply from here emails / pushes to the widget exactly as it does there.
 */
const props = defineProps({
  complaint: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})

const toast = useToast()
const mode = ref('PUBLIC_REPLY')
const html = ref('')
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
}

async function send() {
  if (!canSend.value) return
  sending.value = true
  try {
    await post(`/v1/services/customerComplaints/${props.complaint.id}/reply`, {
      body: text.value,
      bodyHtml: html.value,
      kind: mode.value,
    })
    reset()
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

// ── Canned responses ────────────────────────────────────────────────────────
const canned = useLiveQuery(
  async (db) =>
    (await db.ComplaintCannedResponse.where().exec()).sort((a, b) => a.name.localeCompare(b.name)),
  { models: ['ComplaintCannedResponse'], initial: [] },
)
function substitute(t) {
  const s = currentSession.value
  const agent = [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Support'
  return String(t ?? '')
    .replaceAll('{{customer.name}}', props.complaint.customerName || 'there')
    .replaceAll('{{ticket.number}}', props.complaint.complaintNumber || '')
    .replaceAll('{{agent.name}}', agent)
}
const cannedMenu = computed(() =>
  canned.value.map((r) => ({
    name: r.name,
    click: () => {
      const c = substitute(r.bodyHtml || r.body)
      html.value = html.value?.trim() ? `${html.value}${c}` : c
      editorRef.value?.editor?.commands.setContent(html.value)
    },
  })),
)

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

    <div
      class="desk-composer tw:rounded-lg tw:border"
      :class="
        mode === 'INTERNAL_NOTE'
          ? 'desk-composer--note tw:border-amber-200'
          : 'tw:border-divider tw:focus-within:border-primary'
      "
    >
      <!-- Keyed on mode: the editor's placeholder is fixed at mount, so a Reply ↔
           Note switch remounts it (the draft is carried in `html`). -->
      <BaseRichTextEditor
        ref="editorRef"
        :key="mode"
        v-model="html"
        :placeholder="placeholder"
        :editable="!disabled && (mode === 'INTERNAL_NOTE' || canPublicReply)"
      />
    </div>

    <div class="tw:mt-2 tw:flex tw:items-center tw:justify-between">
      <BaseMenu v-if="cannedMenu.length" :items="cannedMenu" flip>
        <template #trigger>
          <BaseButton variant="outline" size="sm">
            <IconMessage2 :size="14" class="tw:mr-1" />
            Canned
            <IconChevronDown :size="12" class="tw:ml-1" />
          </BaseButton>
        </template>
      </BaseMenu>
      <span v-else />
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
.desk-composer :deep(.rich-text-editor-content) {
  min-height: 4.5rem;
  max-height: 14rem;
  overflow-y: auto;
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
