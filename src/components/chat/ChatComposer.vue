<script setup>
import { IconSend, IconPlayerStop } from '@tabler/icons-vue'

const props = defineProps({
  isStreaming: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'cancel'])

const text = ref('')
const textareaRef = ref(null)

function autoresize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

watch(text, autoresize)

function submit() {
  const value = text.value.trim()
  if (!value || props.isStreaming || props.disabled) return
  emit('submit', value)
  text.value = ''
  nextTick(() => autoresize())
}

function handleKeydown(e) {
  // Enter to send, Shift+Enter for newline
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <div class="tw:flex-none tw:border-t tw:border-divider tw:p-3 tw:bg-main">
    <div class="tw:flex tw:items-end tw:gap-2">
      <textarea
        ref="textareaRef"
        v-model="text"
        rows="1"
        placeholder="Ask anything about your QMS data…"
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
        :disabled="!text.trim() || disabled"
        title="Send (Enter)"
        @click="submit"
      >
        <IconSend :size="16" />
      </button>
    </div>
    <div class="tw:mt-1.5 tw:text-xs tw:text-secondary tw:text-right tw:pr-1">
      Enter to send · Shift+Enter for newline
    </div>
  </div>
</template>
