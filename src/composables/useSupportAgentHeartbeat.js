import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

/**
 * App-wide presence heartbeat for Support Desk agents (spec §6).
 *
 * The server treats an agent as available only while their heartbeat is
 * fresh (< 90 s). The desk's presence pill used to be the only beater, so an
 * agent who navigated to another module silently dropped out of the
 * auto-assign pool after a minute and a half. Mounted once in App.vue, this
 * beats every 30 s for the whole session whenever the user is an agent whose
 * manual status is not OFFLINE — reading that from IDB, so it costs nothing
 * for non-agents. Tab hidden → keep beating (an agent on another tab is still
 * at their desk); tab closed → beats stop → offline within 90 s, by design.
 */
export function useSupportAgentHeartbeat() {
  const userId = computed(() => currentSession.value?.userId ?? null)
  const me = useLiveQueryWithDeps(
    [() => userId.value],
    async (db, [uid]) => (uid ? db.SupportAgent.where('userId', uid).first() : null),
    { models: ['SupportAgent'] },
  )
  const active = computed(() => !!me.value && me.value.manualStatus !== 'OFFLINE')

  let timer = null
  async function beat() {
    if (!active.value) return
    try {
      await post('/v1/services/supportDesk/agents/me/heartbeat', {})
    } catch {
      /* transient — the next beat retries */
    }
  }
  function start() {
    stop()
    beat()
    timer = setInterval(beat, 30_000)
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }
  watch(active, (on) => (on ? start() : stop()), { immediate: true })
  onBeforeUnmount(stop)
  return { agent: me, active }
}
