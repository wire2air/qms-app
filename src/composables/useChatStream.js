import { ref, shallowRef, watch, onScopeDispose } from 'vue'

/**
 * AI chat — SSE stream consumer + reactive state.
 *
 * Connects to POST /v1/services/ai/chat/messages, reads the SSE response,
 * and exposes a flat `items` list the UI can render:
 *
 *   items = [
 *     { kind: 'user',      id, text, createdAt },
 *     { kind: 'assistant', id, text, turn, createdAt },
 *     { kind: 'tool_call', id, toolName, toolUseId, args, result, isError, status, createdAt },
 *     ...
 *   ]
 *
 * Items are pushed in arrival order; tool_call objects are mutated in place
 * when their tool_call_result event lands (status: 'running' → 'done').
 *
 * History (when threadId is set) is loaded via GET /threads/:id/messages and
 * rebuilt into the same items shape so the UI doesn't need to distinguish
 * "live" from "replayed".
 *
 * Usage:
 *   const chat = useChatStream({ threadId })
 *   await chat.send('Show me CAPAs closed last month')
 *
 *   <template>
 *     <div v-for="item in chat.items.value" :key="item.id">…</div>
 *     <span v-if="chat.isStreaming.value">Thinking…</span>
 *   </template>
 */

// Paths are prefixed with /api so they route through Vite's dev proxy
// (which strips /api and forwards to the backend). Matches the convention
// used by src/api/client.js for the axios-based callers.
const SEND_ENDPOINT = '/api/v1/services/ai/chat/messages'
const HISTORY_ENDPOINT = (id) => `/api/v1/services/ai/chat/threads/${id}/messages`

export function useChatStream({ threadId: initialThreadId = null } = {}) {
  const threadId = ref(initialThreadId)
  const title = ref('')
  const items = shallowRef([])
  const isStreaming = ref(false)
  const error = ref(null)
  const lastUsage = ref(null)

  // Active stream context — we keep a Map for in-flight tool cards so
  // tool_call_result can find its sibling by toolUseId without scanning.
  let activeAssistant = null
  let activeTools = new Map()
  let abortController = null

  // ─── History loader ─────────────────────────────────────────────────────
  async function loadHistory(id) {
    activeAssistant = null
    activeTools = new Map()
    error.value = null
    if (!id) {
      items.value = []
      title.value = ''
      return
    }
    try {
      const res = await fetch(HISTORY_ENDPOINT(id), { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 404) {
          items.value = []
          title.value = ''
          error.value = { code: 'NOT_FOUND', message: 'Thread not found.' }
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      title.value = json.thread?.title ?? ''
      items.value = mapHistoryRows(json.messages ?? [])
    } catch (e) {
      error.value = { code: 'LOAD_FAILED', message: e.message ?? 'Failed to load thread.' }
    }
  }

  // Initial load + react to threadId changes.
  //
  // If a stream is in flight, skip the history fetch — the SSE `thread`
  // event sets threadId mid-turn, but the backend transaction hasn't
  // committed yet, so a GET would 404. We already have every message
  // live in `items.value`, so a refetch would be redundant anyway.
  watch(threadId, (id) => {
    if (isStreaming.value) return
    loadHistory(id)
  }, { immediate: true })

  // ─── Send ───────────────────────────────────────────────────────────────
  async function send(message, { context, attachments } = {}) {
    if (isStreaming.value) return
    if (!message?.trim()) return
    isStreaming.value = true
    error.value = null
    lastUsage.value = null
    const threadIdAtStart = threadId.value

    const sentAttachments = Array.isArray(attachments) && attachments.length ? attachments : null

    // Optimistic user item (names only — the bubble renders chips)
    const next = items.value.slice()
    next.push({
      kind: 'user',
      id: `tmp_${Date.now()}`,
      text: message,
      attachments: sentAttachments ? sentAttachments.map((a) => ({ name: a.name })) : null,
      createdAt: new Date(),
    })
    items.value = next

    activeAssistant = null
    activeTools = new Map()
    abortController = new AbortController()

    try {
      const res = await fetch(SEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        body: JSON.stringify({
          threadId: threadId.value,
          message,
          context,
          attachments: sentAttachments
            ? sentAttachments.map((a) => ({ name: a.name, text: a.text }))
            : undefined,
        }),
        signal: abortController.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
      }
      if (!res.body) {
        throw new Error('Response body missing — SSE not supported by this transport.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          if (block.trim()) dispatch(parseSseBlock(block))
        }
      }
      // Drain any trailing data without a separator
      if (buffer.trim()) dispatch(parseSseBlock(buffer))
    } catch (e) {
      if (e.name === 'AbortError') {
        error.value = { code: 'ABORTED', message: 'Cancelled.' }
      } else {
        error.value = { code: 'SEND_FAILED', message: e.message ?? 'Send failed.' }
      }
    } finally {
      // A failed FIRST send (abort or server error) rolls the new thread back
      // server-side — drop the provisional id so the next send creates a
      // fresh thread instead of posting to a rolled-back one forever. Reset
      // BEFORE isStreaming flips so the threadId watcher (which skips loads
      // while streaming) doesn't wipe the visible conversation.
      if (!threadIdAtStart && threadId.value && error.value) threadId.value = null
      isStreaming.value = false
      abortController = null
    }
  }

  // ─── Dispatcher ─────────────────────────────────────────────────────────
  function dispatch(parsed) {
    if (!parsed) return
    const { event, data } = parsed
    switch (event) {
      case 'thread':
        if (data.id && data.id !== threadId.value) threadId.value = data.id
        if (data.title) title.value = data.title
        break

      case 'thread_titled':
        if (data.title) title.value = data.title
        break

      case 'user_saved': {
        // Replace the optimistic id with the server id (last user item).
        const arr = items.value.slice()
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].kind === 'user' && String(arr[i].id).startsWith('tmp_')) {
            arr[i] = { ...arr[i], id: data.messageId }
            break
          }
        }
        items.value = arr
        break
      }

      case 'model_turn_start':
        activeAssistant = null
        // Per-turn we expect tool_use_id to be unique — keep map for the whole stream.
        break

      case 'assistant_text': {
        if (!activeAssistant) {
          activeAssistant = {
            kind: 'assistant',
            id: 'streaming',
            text: '',
            turn: data.turn ?? 0,
            createdAt: new Date(),
          }
          items.value = [...items.value, activeAssistant]
        }
        activeAssistant.text = activeAssistant.text
          ? `${activeAssistant.text}\n${data.text}`
          : data.text
        // Force shallowRef to publish — we mutated a contained object.
        items.value = items.value.slice()
        break
      }

      case 'assistant_saved': {
        if (activeAssistant) {
          activeAssistant.id = data.messageId
          items.value = items.value.slice()
        }
        break
      }

      case 'tool_call_start': {
        const card = {
          kind: 'tool_call',
          id: `tool_${data.toolUseId}`,
          toolName: data.toolName,
          toolUseId: data.toolUseId,
          args: data.args,
          status: 'running',
          createdAt: new Date(),
        }
        activeTools.set(data.toolUseId, card)
        items.value = [...items.value, card]
        break
      }

      case 'tool_call_result': {
        const card = activeTools.get(data.toolUseId)
        if (card) {
          card.status = 'done'
          card.result = data.result
          card.isError = !!data.isError
          items.value = items.value.slice()
        }
        break
      }

      case 'done':
        lastUsage.value = {
          turns: data.turns,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          stopReason: data.stopReason,
        }
        break

      case 'error':
        error.value = { code: data.code ?? 'CHAT_ERROR', message: data.message ?? 'Chat error.' }
        break

      // tool_saved is an internal persistence ack — UI doesn't need it.
      // Ignore unknown events; the UI shouldn't be brittle if the backend
      // adds new event types.
      default:
        break
    }
  }

  function reset() {
    threadId.value = null
    items.value = []
    title.value = ''
    error.value = null
    lastUsage.value = null
    activeAssistant = null
    activeTools = new Map()
  }

  function cancel() {
    if (abortController) abortController.abort()
  }

  onScopeDispose(() => {
    if (abortController) abortController.abort()
  })

  return {
    threadId,
    title,
    items,
    isStreaming,
    error,
    lastUsage,
    send,
    reset,
    cancel,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseSseBlock(block) {
  let event = 'message'
  const dataLines = []
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue // comment
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  const raw = dataLines.join('\n')
  if (!raw) return null
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    data = { raw }
  }
  return { event, data }
}

function mapHistoryRows(rows) {
  // Tool args live in the assistant rows' raw tool_use blocks (toolCalls) —
  // index them so tool cards replay with their args (the proposal card
  // renders the proposed fields from args).
  const argsByToolUseId = new Map()
  for (const row of rows) {
    if (row.role !== 'assistant' || !Array.isArray(row.toolCalls)) continue
    for (const block of row.toolCalls) {
      if (block?.type === 'tool_use' && block.id) argsByToolUseId.set(block.id, block.input ?? null)
    }
  }

  const out = []
  for (const row of rows) {
    if (row.role === 'user') {
      out.push({
        kind: 'user',
        id: row.id,
        text: row.content ?? '',
        attachments: Array.isArray(row.attachments) && row.attachments.length ? row.attachments : null,
        createdAt: row.createdAt,
      })
    } else if (row.role === 'assistant') {
      // Only emit a bubble when the assistant row had actual text. Pure tool-
      // use rows (no text) are represented by the tool cards that follow.
      if (row.content) {
        out.push({
          kind: 'assistant',
          id: row.id,
          text: row.content,
          turn: 0, // not persisted; UI doesn't rely on this in history view
          createdAt: row.createdAt,
        })
      }
    } else if (row.role === 'tool') {
      out.push({
        kind: 'tool_call',
        id: `tool_${row.toolUseId ?? row.id}`,
        toolName: row.toolName,
        toolUseId: row.toolUseId,
        args: argsByToolUseId.get(row.toolUseId) ?? null,
        result: row.toolResult,
        isError: !!row.isError,
        status: 'done',
        createdAt: row.createdAt,
      })
    }
  }
  return out
}
