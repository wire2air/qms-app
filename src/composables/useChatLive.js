import { getSocket } from '@/api/socket.js'

/**
 * Live-chat presence + typing for ONE conversation, over the app socket (the
 * sync service's default namespace — see backend/sync/chatSocket.js).
 *
 * Messages themselves still arrive through the normal sync → IndexedDB path;
 * this only carries the ephemeral bits: is the visitor connected right now,
 * are they typing, and "I am typing" in the other direction. Everything is
 * best-effort: without a socket the thread just falls back to last-seen.
 *
 * @param {import('vue').Ref<string|null>} conversationId
 * @param {import('vue').Ref<boolean>} enabled — only live chats join a room
 */
// One set of socket listeners per page, dispatching to live instances —
// socket.js wraps every `on` listener (date transform), so a per-instance
// `off(event, fn)` could never find its listener again and would leak.
const instances = new Set()
let wired = null
function wire() {
  const s = getSocket()
  if (!s || wired === s) return
  wired = s
  s.on('chat:typing', (e) => instances.forEach((i) => i.onTyping(e)))
  s.on('chat:presence', (e) => instances.forEach((i) => i.onPresence(e)))
  s.on('connect', () => instances.forEach((i) => i.onReconnect()))
}

export function useChatLive(conversationId, enabled) {
  const visitorTyping = ref(false)
  // null = unknown (no socket / not joined), else the live room membership.
  const visitorOnlineLive = ref(null)

  let joinedId = null
  let typingOn = false
  let typingLast = 0
  let typingStop = null

  function sock() {
    const s = getSocket()
    return s && s.connected ? s : null
  }
  function onTyping(e) {
    if (e?.conversationId === joinedId) visitorTyping.value = !!e.on
  }
  function onPresence(e) {
    if (e?.conversationId === joinedId) visitorOnlineLive.value = !!e.online
  }
  function onReconnect() {
    if (joinedId) join(joinedId)
  }
  function join(id) {
    const s = sock()
    if (!s || !id) return
    s.emit('chat:join', { conversationId: id }, (ack) => {
      if (ack?.ok && joinedId === id) visitorOnlineLive.value = !!ack.visitorOnline
    })
  }
  function leave(id) {
    const s = getSocket()
    if (!s || !id) return
    if (typingOn) s.emit('chat:typing', { conversationId: id, on: false })
    s.emit('chat:leave', { conversationId: id })
  }
  function sync() {
    const next = enabled.value ? conversationId.value : null
    if (next === joinedId) return
    if (joinedId) leave(joinedId)
    joinedId = next
    visitorTyping.value = false
    visitorOnlineLive.value = null
    typingOn = false
    if (joinedId) join(joinedId)
  }

  /** Call on every keystroke; throttled to one emit per 2 s, auto-off after 3 s idle. */
  function sendTyping(on) {
    const s = sock()
    if (!s || !joinedId) return
    const now = Date.now()
    if (on) {
      if (!typingOn || now - typingLast > 2000) {
        s.emit('chat:typing', { conversationId: joinedId, on: true })
        typingOn = true
        typingLast = now
      }
      clearTimeout(typingStop)
      typingStop = setTimeout(() => sendTyping(false), 3000)
    } else if (typingOn) {
      s.emit('chat:typing', { conversationId: joinedId, on: false })
      typingOn = false
      clearTimeout(typingStop)
    }
  }

  const self = { onTyping, onPresence, onReconnect }
  wire()
  instances.add(self)
  watch([conversationId, enabled], sync, { immediate: true })
  onBeforeUnmount(() => {
    instances.delete(self)
    clearTimeout(typingStop)
    if (joinedId) leave(joinedId)
  })

  return { visitorTyping, visitorOnlineLive, sendTyping }
}
