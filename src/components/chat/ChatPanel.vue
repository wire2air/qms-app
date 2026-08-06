<script setup>
import { onClickOutside } from '@vueuse/core'
import { IconX, IconSparkles, IconHistory, IconPlus, IconFileText } from '@tabler/icons-vue'
import { useChatPanel } from '@/composables/useChatPanel'

/**
 * AI chat slide-out (see AI_PLAN.md §6).
 *
 * Mounted once at the App level so its state survives route changes.
 * Cmd-J / Ctrl-J toggles open/close. The panel itself is conditionally
 * rendered via v-if so when it's closed we don't keep an active SSE stream
 * or watchers in memory.
 *
 * The conversation itself (messages, streaming, composer) lives in the
 * shared ChatConversation surface — this component is just the global
 * shell: header, thread history, entity-context handoff.
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

const conversationRef = ref(null)

const DEFAULT_SUGGESTIONS = [
  'Show me CAPAs closed last month',
  'Any open NCs in the engineering department?',
  'Find documents mentioning calibration',
]

// Entity context: attached to the FIRST send of a new thread only (the
// backend stores it on the thread row; later turns reload it from there).
function contextProvider(threadId) {
  if (threadId) return null
  return panel.consumePendingContext()
}

// Chat history lives in a header dropdown (not a persistent rail) so the
// conversation gets the full panel width.
const showHistory = ref(false)
const historyRef = ref(null)
onClickOutside(historyRef, () => {
  showHistory.value = false
})

// Surface the entity context (pending — about to be attached to next new
// thread).
const activeContext = computed(() => {
  if (panel.pendingContext.value && !panel.activeThreadId.value) return panel.pendingContext.value
  return null
})

function handleSelectThread(id) {
  conversationRef.value?.cancel?.()
  panel.selectThread(id)
  showHistory.value = false
}

function handleNewChat() {
  conversationRef.value?.cancel?.()
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
              {{ conversationRef?.title || 'AI Assistant' }}
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
              <div class="tw:px-3 tw:py-2 tw:border-b tw:border-divider tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
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

        <!-- Conversation (full width — history lives in the header dropdown) -->
        <ChatConversation
          ref="conversationRef"
          v-model:threadId="panel.activeThreadId.value"
          :contextProvider="contextProvider"
          :suggestions="DEFAULT_SUGGESTIONS"
        />
      </aside>
    </Transition>
  </Teleport>
</template>
