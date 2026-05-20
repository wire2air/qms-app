import { ref } from 'vue'

/**
 * AI chat panel — single source of truth for the slide-out's state.
 *
 * `pendingContext` is consumed on the next message send when a new thread is
 * about to be created. The pattern is: caller (e.g. CapaPage's "Ask AI"
 * button) opens the panel with a context object; on first user message the
 * panel passes it to send(), which the backend stores on the thread row;
 * subsequent turns reload that context from the thread.
 */
const isOpen = ref(false)
const activeThreadId = ref(null)
const pendingContext = ref(null)

export function useChatPanel() {
  function open({ threadId, context } = {}) {
    if (threadId !== undefined) activeThreadId.value = threadId
    if (context !== undefined) pendingContext.value = context
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  function toggle() {
    if (!isOpen.value) pendingContext.value = null // fresh open via Cmd-K clears any stale context
    isOpen.value = !isOpen.value
  }
  function selectThread(threadId) {
    activeThreadId.value = threadId
    pendingContext.value = null // switching threads drops any pending context
  }
  function startNew(context = null) {
    activeThreadId.value = null
    pendingContext.value = context
  }
  function consumePendingContext() {
    const c = pendingContext.value
    pendingContext.value = null
    return c
  }
  return {
    isOpen,
    activeThreadId,
    pendingContext,
    open,
    close,
    toggle,
    selectThread,
    startNew,
    consumePendingContext,
  }
}
