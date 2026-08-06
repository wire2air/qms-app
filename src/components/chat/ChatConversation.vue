<script setup>
import { IconSparkles, IconAlertTriangle } from '@tabler/icons-vue'
import { useChatStream } from '@/composables/useChatStream'
import { buildRecordIndex } from '@/utils/recordRef.js'

/**
 * The reusable Ask-AI conversation surface: message list + streaming state +
 * composer, detached from any particular shell. The global slide-out
 * (ChatPanel) and module-scoped hosts (FormAiChatPanel in the form builder)
 * both mount this — same UI, different launch context.
 *
 * The launch context is supplied via `contextProvider(threadId)`, called on
 * EVERY send: entity pages return their context only for the first message of
 * a new thread; kind-scoped surfaces (form builder) return fresh context each
 * time so the backend always sees current state.
 *
 * `propose_form_fields` tool calls render as an applyable proposal card; the
 * host listens for @apply-proposal and marks success via `appliedIds`.
 */
const props = defineProps({
  // (threadId | null) => context object | null — evaluated per send.
  contextProvider: { type: Function, default: null },
  // Empty-state example prompts.
  suggestions: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Ask anything about your QMS data…' },
  allowAttachments: { type: Boolean, default: false },
  // Host can apply field proposals into a live form builder.
  canApplyProposals: { type: Boolean, default: false },
  // Reactive Set of toolUseIds the host has applied.
  appliedIds: { type: Object, default: null },
})

const emit = defineEmits(['applyProposal'])

// Two-way thread binding with the host (the panel's history switcher, or a
// host-local ref). Server-assigned ids on first send propagate up.
const threadId = defineModel('threadId', { type: String, default: null })

const chat = useChatStream({ threadId: threadId.value })

watch(threadId, (id) => {
  if (id !== chat.threadId.value) chat.threadId.value = id
})
watch(chat.threadId, (id) => {
  if (id !== threadId.value) threadId.value = id
})

// Record-number → detail-link index, built from the tool-call results in the
// stream. ChatMessage uses it to linkify record identifiers (EV-…, NC-…, …)
// in the assistant markdown so users can click through to the record.
const recordIndex = computed(() => buildRecordIndex(chat.items.value))

async function handleSubmit(message, attachments) {
  const context = props.contextProvider ? props.contextProvider(chat.threadId.value) : null
  await chat.send(message, { context, attachments })
}

function handleCancel() {
  chat.cancel?.()
}

function isProposalCard(item) {
  return item.kind === 'tool_call' && item.toolName === 'propose_form_fields'
}

function onApplyProposal(item, proposal) {
  emit('applyProposal', { toolUseId: item.toolUseId, proposal })
}

// Auto-scroll to bottom as messages grow.
const scrollRef = ref(null)
watch(
  () => chat.items.value,
  async () => {
    await nextTick()
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  },
  { deep: true },
)

const composerRef = ref(null)

defineExpose({
  title: chat.title,
  isStreaming: chat.isStreaming,
  cancel: () => chat.cancel?.(),
  focus: () => composerRef.value?.focus?.(),
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0 tw:min-h-0 tw:overflow-hidden">
    <!-- Messages -->
    <div ref="scrollRef" class="tw:flex-1 tw:overflow-y-auto tw:p-4 tw:flex tw:flex-col tw:gap-3">
      <template v-if="chat.items.value.length === 0 && !chat.isStreaming.value">
        <div
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:text-center tw:gap-3 tw:text-secondary"
        >
          <IconSparkles :size="32" class="tw:text-primary/60" />
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">
              <slot name="emptyTitle">How can I help?</slot>
            </div>
            <div v-if="suggestions.length" class="tw:text-xs tw:mt-1">Try one of these:</div>
          </div>
          <div v-if="suggestions.length" class="tw:flex tw:flex-col tw:gap-2 tw:max-w-md tw:w-full">
            <!-- Prefill the composer (don't send) so an already-attached file
                 goes with the message and the user can still edit the text. -->
            <button
              v-for="example in suggestions"
              :key="example"
              class="tw:text-left tw:text-sm tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
              @click="composerRef?.setText?.(example)"
            >
              {{ example }}
            </button>
          </div>
        </div>
      </template>

      <template v-for="item in chat.items.value" :key="item.id">
        <FormFieldProposalCard
          v-if="isProposalCard(item)"
          :card="item"
          :canApply="canApplyProposals"
          :applied="!!appliedIds?.has?.(item.toolUseId)"
          @apply="(proposal) => onApplyProposal(item, proposal)"
        />
        <ChatToolCallCard v-else-if="item.kind === 'tool_call'" :card="item" />
        <ChatMessage v-else :item="item" :recordIndex="recordIndex" />
      </template>

      <!-- "thinking" indicator while we wait on the first assistant text -->
      <div
        v-if="chat.isStreaming.value && !chat.items.value.some((i) => i.kind === 'assistant')"
        class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary tw:px-2"
      >
        <div class="tw:flex tw:gap-1">
          <span class="tw:size-1.5 tw:rounded-full tw:bg-primary tw:animate-pulse"></span>
          <span
            class="tw:size-1.5 tw:rounded-full tw:bg-primary tw:animate-pulse"
            style="animation-delay: 0.2s"
          ></span>
          <span
            class="tw:size-1.5 tw:rounded-full tw:bg-primary tw:animate-pulse"
            style="animation-delay: 0.4s"
          ></span>
        </div>
        <span>Thinking…</span>
      </div>

      <!-- Error banner -->
      <div
        v-if="chat.error.value"
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-sm"
      >
        <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:font-semibold">{{ chat.error.value.code || 'Error' }}</div>
          <div class="tw:text-xs tw:mt-0.5 tw:wrap-break-word">
            {{ chat.error.value.message }}
          </div>
        </div>
      </div>
    </div>

    <!-- Composer -->
    <ChatComposer
      ref="composerRef"
      :isStreaming="chat.isStreaming.value"
      :placeholder="placeholder"
      :allowAttachments="allowAttachments"
      @submit="handleSubmit"
      @cancel="handleCancel"
    />
  </div>
</template>
