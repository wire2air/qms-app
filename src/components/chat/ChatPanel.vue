<script setup>
import { onClickOutside } from '@vueuse/core'
import {
  IconX,
  IconSparkles,
  IconHistory,
  IconPlus,
  IconAlertTriangle,
  IconFileText,
} from '@tabler/icons-vue'
import { useChatPanel } from '@/composables/useChatPanel'
import { useChatStream } from '@/composables/useChatStream'

/**
 * AI chat slide-out (see AI_PLAN.md §6).
 *
 * Mounted once at the App level so its state survives route changes.
 * Cmd-J / Ctrl-J toggles open/close. The panel itself is conditionally
 * rendered via v-if so when it's closed we don't keep an active SSE stream
 * or watchers in memory.
 */

const panel = useChatPanel()
const { confirm } = useConfirm()

// Cmd-J / Ctrl-J toggles the panel globally (fires even while typing). ⌘K/⌘P
// now belong to the command palette (C4).
useHotkeys({
  keys: 'mod+j',
  description: 'Toggle AI assistant',
  group: 'Global',
  allowInInput: true,
  handler: () => panel.toggle(),
})

// One chat-stream instance per panel mount. It reacts to `threadId` mutations
// internally (loads history when set), so we keep it synced with the panel's
// activeThreadId rather than recreating the composable.
const chat = useChatStream({ threadId: panel.activeThreadId.value })

// Panel → chat
watch(panel.activeThreadId, (id) => {
  if (id !== chat.threadId.value) chat.threadId.value = id
})
// Chat → panel (when a new thread is server-assigned on first send)
watch(chat.threadId, (id) => {
  if (id !== panel.activeThreadId.value) panel.selectThread(id)
})

// Chat history lives in a header dropdown (not a persistent rail) so the
// conversation gets the full panel width.
const showHistory = ref(false)
const historyRef = ref(null)
onClickOutside(historyRef, () => {
  showHistory.value = false
})

// Surface the entity context (either pending — about to be attached to next
// new thread — or already saved on the active thread).
const activeContext = computed(() => {
  if (panel.pendingContext.value && !chat.threadId.value) return panel.pendingContext.value
  return null // TODO: when chat exposes thread.context, surface that too
})

async function handleSubmit(message) {
  // If the panel was opened with a context (e.g. "Ask AI" on a CAPA page),
  // attach it to the first send — backend stores it on the new thread row.
  const context = chat.threadId.value ? null : panel.consumePendingContext()
  await chat.send(message, { context })
}

function handleCancel() {
  chat.cancel?.()
}

function handleSelectThread(id) {
  if (chat.isStreaming.value) chat.cancel?.()
  panel.selectThread(id)
  showHistory.value = false
}

function handleNewChat() {
  if (chat.isStreaming.value) chat.cancel?.()
  panel.startNew()
  showHistory.value = false
}

async function handleDeleteThread(thread) {
  if (
    !(await confirm({
      title: 'Delete Conversation',
      message: `Delete "${thread.title || 'this conversation'}"?`,
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
  if (panel.activeThreadId.value === thread.id) panel.startNew()
  await thread.delete()
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
</script>

<template>
  <Teleport to="body">
    <Transition
      enterActiveClass="tw:transition-transform tw:duration-200 tw:ease-out"
      leaveActiveClass="tw:transition-transform tw:duration-150 tw:ease-in"
      enterFromClass="tw:translate-x-full"
      leaveToClass="tw:translate-x-full"
    >
      <aside
        v-if="panel.isOpen.value"
        class="tw:bg-main tw:border-l tw:border-divider tw:shadow-2xl"
        style="
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(880px, 100vw);
          height: 100vh;
          max-height: 100vh;
          z-index: 40;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        "
      >
        <!-- Header -->
        <header
          class="tw:flex! tw:flex-none tw:items-center tw:gap-2 tw:px-4 tw:py-3 tw:border-b tw:border-divider tw:bg-sidebar"
        >
          <IconSparkles :size="18" class="tw:text-primary" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-bold tw:text-on-main tw:truncate">
              {{ chat.title.value || 'AI Assistant' }}
            </div>
            <div class="tw:text-xs tw:text-secondary">Ask anything about your QMS data</div>
          </div>

          <!-- Chat history dropdown -->
          <div ref="historyRef" class="tw:relative">
            <button
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
              :class="showHistory ? 'tw:bg-main-hover tw:text-on-main' : ''"
              title="Chat history"
              @click="showHistory = !showHistory"
            >
              <IconHistory :size="18" />
            </button>
            <div
              v-if="showHistory"
              class="tw:absolute tw:right-0 tw:top-full tw:mt-2 tw:w-80 tw:max-h-96 tw:overflow-hidden tw:flex tw:flex-col tw:bg-main tw:border tw:border-divider tw:rounded-xl tw:shadow-xl tw:z-modal"
            >
              <div class="tw:px-3 tw:py-2 tw:border-b tw:border-divider tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">
                Chat history
              </div>
              <div class="tw:flex-1 tw:overflow-y-auto">
                <ChatThreadList
                  :activeThreadId="panel.activeThreadId.value"
                  @select="handleSelectThread"
                  @delete="handleDeleteThread"
                />
              </div>
            </div>
          </div>

          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
            title="New chat"
            @click="handleNewChat"
          >
            <IconPlus :size="18" />
          </button>

          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
            title="Close (Cmd-J)"
            @click="panel.close()"
          >
            <IconX :size="18" />
          </button>
        </header>

        <!-- Context banner -->
        <div
          v-if="activeContext"
          class="tw:flex tw:flex-none tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:bg-primary/5 tw:text-xs"
        >
          <IconFileText :size="14" class="tw:text-primary tw:flex-none" />
          <span class="tw:text-secondary">Context:</span>
          <span class="tw:font-semibold tw:text-on-main">{{ activeContext.entityType }}</span>
          <span v-if="activeContext.entityTitle" class="tw:text-on-main tw:truncate">
            — {{ activeContext.entityTitle }}
          </span>
        </div>

        <!-- Body -->
        <div class="tw:flex tw:flex-1 tw:min-h-0 tw:overflow-hidden">
          <!-- Conversation (full width — history lives in the header dropdown) -->
          <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0 tw:overflow-hidden">
            <!-- Messages -->
            <div
              ref="scrollRef"
              class="tw:flex-1 tw:overflow-y-auto tw:p-4 tw:flex tw:flex-col tw:gap-3"
            >
              <template v-if="chat.items.value.length === 0 && !chat.isStreaming.value">
                <div
                  class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:text-center tw:gap-3 tw:text-secondary"
                >
                  <IconSparkles :size="32" class="tw:text-primary/60" />
                  <div>
                    <div class="tw:text-sm tw:font-semibold tw:text-on-main">How can I help?</div>
                    <div class="tw:text-xs tw:mt-1">Try one of these:</div>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-2 tw:max-w-md tw:w-full">
                    <button
                      v-for="example in [
                        'Show me CAPAs closed last month',
                        'Any open NCs in the engineering department?',
                        'Find documents mentioning calibration',
                      ]"
                      :key="example"
                      class="tw:text-left tw:text-sm tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
                      @click="handleSubmit(example)"
                    >
                      {{ example }}
                    </button>
                  </div>
                </div>
              </template>

              <template v-for="item in chat.items.value" :key="item.id">
                <ChatToolCallCard v-if="item.kind === 'tool_call'" :card="item" />
                <ChatMessage v-else :item="item" />
              </template>

              <!-- "thinking" indicator while we wait on the first assistant text -->
              <div
                v-if="
                  chat.isStreaming.value && !chat.items.value.some((i) => i.kind === 'assistant')
                "
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
              :isStreaming="chat.isStreaming.value"
              @submit="handleSubmit"
              @cancel="handleCancel"
            />
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
