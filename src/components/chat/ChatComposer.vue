<script setup>
import { IconSend, IconPlayerStop, IconPaperclip, IconX, IconLoader2 } from '@tabler/icons-vue'
import {
  parseChatAttachment,
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
} from '@/utils/chatAttachments.js'

const props = defineProps({
  isStreaming: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Ask anything about your QMS data…' },
  // Enables the paperclip: files are extracted to text in the browser
  // (utils/chatAttachments.js) and ride the next send.
  allowAttachments: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'cancel'])

const text = ref('')
const textareaRef = ref(null)
const fileInputRef = ref(null)
const attachments = ref([]) // [{ name, text, truncated }]
const parsing = ref(false)
const attachmentError = ref(null)

function autoresize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

watch(text, autoresize)

function submit() {
  const value = text.value.trim()
  if (!value || props.isStreaming || props.disabled || parsing.value) return
  emit('submit', value, attachments.value.slice())
  text.value = ''
  attachments.value = []
  attachmentError.value = null
  nextTick(() => autoresize())
}

function handleKeydown(e) {
  // Enter to send, Shift+Enter for newline
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

async function onFilesPicked(event) {
  const files = [...(event.target?.files ?? [])]
  event.target.value = '' // allow re-picking the same file
  if (!files.length) return
  attachmentError.value = null
  parsing.value = true
  try {
    for (const file of files) {
      if (attachments.value.length >= MAX_CHAT_ATTACHMENTS) {
        attachmentError.value = `At most ${MAX_CHAT_ATTACHMENTS} attachments per message.`
        break
      }
      try {
        const parsed = await parseChatAttachment(file)
        attachments.value = [...attachments.value, parsed]
      } catch (err) {
        attachmentError.value = err?.message || `Could not read "${file.name}".`
      }
    }
  } finally {
    parsing.value = false
  }
}

function removeAttachment(index) {
  attachments.value = attachments.value.filter((_, i) => i !== index)
}

// Prefill (suggestion chips route through the composer so any staged
// attachments ride along with the send).
function setText(value) {
  text.value = value
  nextTick(() => {
    autoresize()
    textareaRef.value?.focus()
  })
}

defineExpose({ focus: () => textareaRef.value?.focus(), setText })
</script>

<template>
  <div class="tw:flex-none tw:border-t tw:border-divider tw:p-3 tw:bg-main">
    <!-- Attachment chips -->
    <div v-if="attachments.length || parsing" class="tw:flex tw:flex-wrap tw:gap-1.5 tw:mb-2">
      <span
        v-for="(att, i) in attachments"
        :key="`${att.name}-${i}`"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-primary/10 tw:text-primary tw:text-xs tw:pl-2.5 tw:pr-1 tw:py-0.5"
      >
        <IconPaperclip :size="12" class="tw:flex-none" />
        <span class="tw:max-w-48 tw:truncate">{{ att.name }}</span>
        <span v-if="att.truncated" class="tw:text-micro tw:opacity-70">(truncated)</span>
        <button
          class="tw:p-0.5 tw:rounded-full tw:hover:bg-primary/20 tw:transition-colors"
          :aria-label="`Remove ${att.name}`"
          @click="removeAttachment(i)"
        >
          <IconX :size="12" />
        </button>
      </span>
      <span
        v-if="parsing"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:py-0.5"
      >
        <IconLoader2 :size="12" class="tw:animate-spin" />
        Reading file…
      </span>
    </div>

    <div class="tw:flex tw:items-end tw:gap-2">
      <template v-if="allowAttachments">
        <button
          class="tw:p-2.5 tw:rounded-full tw:text-secondary tw:hover:bg-main-hover tw:transition-colors tw:flex-none tw:disabled:opacity-50"
          :disabled="parsing || disabled || attachments.length >= MAX_CHAT_ATTACHMENTS"
          title="Attach a reference file (PDF, Excel/CSV, text)"
          @click="fileInputRef?.click()"
        >
          <IconPaperclip :size="16" />
        </button>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          :accept="CHAT_ATTACHMENT_ACCEPT"
          class="tw:hidden"
          @change="onFilesPicked"
        />
      </template>

      <textarea
        ref="textareaRef"
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        class="tw:flex-1 tw:resize-none tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-secondary tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:transition-colors tw:leading-relaxed"
        :disabled="disabled"
        @keydown="handleKeydown"
      />
      <button
        v-if="isStreaming"
        class="tw:p-2.5 tw:rounded-full tw:bg-red-50 tw:text-red-600 tw:hover:bg-red-100 tw:transition-colors tw:flex-none"
        title="Stop"
        @click="emit('cancel')"
      >
        <IconPlayerStop :size="16" />
      </button>
      <button
        v-else
        class="tw:p-2.5 tw:rounded-full tw:bg-primary tw:text-white tw:hover:bg-primary/90 tw:transition-colors tw:flex-none tw:disabled:bg-secondary tw:disabled:cursor-not-allowed"
        :disabled="!text.trim() || disabled || parsing"
        title="Send (Enter)"
        @click="submit"
      >
        <IconSend :size="16" />
      </button>
    </div>

    <div
      v-if="attachmentError"
      class="tw:mt-1.5 tw:text-xs tw:text-red-600"
    >
      {{ attachmentError }}
    </div>
    <div class="tw:mt-1.5 tw:text-xs tw:text-secondary tw:text-right tw:pr-1">
      Enter to send · Shift+Enter for newline
    </div>
  </div>
</template>
