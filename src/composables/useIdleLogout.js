/**
 * Sign the user out in the BROWSER when they go idle, not merely on their next
 * request (user request 2026-08-30).
 *
 * The server has always enforced the company's `sessionIdleMinutes` — but only
 * when something asks it to. A page left open therefore stayed on screen,
 * looking signed in, until someone clicked; on a shared workstation that is the
 * whole point of the setting defeated. This closes the loop from the other end.
 *
 * ── Two clocks, measuring different things ──────────────────────────────────
 * The server's `lastSeen` is refreshed by ANY authenticated request, background
 * sync included, so it says "the app is running", not "someone is here". This
 * watches real user input, so it is normally the one that fires first — which
 * is the honest reading of idle. It does not merely redirect: it calls the
 * ordinary sign-out, so the session is genuinely destroyed rather than left
 * valid behind a login screen.
 *
 * ── Wall clock, not timers ──────────────────────────────────────────────────
 * Elapsed time is computed by comparing timestamps on a short interval rather
 * than by one long setTimeout. A laptop that sleeps for two hours does not fire
 * a pending timeout on time; comparing clocks means the wake-up sees the real
 * gap and signs out immediately, which is the behaviour the setting promises.
 *
 * ── Across tabs ─────────────────────────────────────────────────────────────
 * Activity is stamped into localStorage, so working in one tab keeps every tab
 * alive and idling out is a shared verdict. (Sign-out already broadcasts to
 * other tabs via currentSession's tabMessage channel.)
 */
import { currentSession, logoutCurrentSession } from '@/utils/currentSession.js'
import { isPublicRoute } from '@/constants/authRoutes.js'

/** Shared across tabs — the last moment a human did something, anywhere. */
const ACTIVITY_KEY = 'qms.lastActivity'

/** How long the warning is shown before the sign-out actually happens. */
export const WARN_BEFORE_MS = 60_000

/** Wall-clock comparisons are cheap; this only bounds how late we can be. */
const CHECK_INTERVAL_MS = 5_000

/** Activity is noisy (mousemove). Persist it at most this often. */
const WRITE_THROTTLE_MS = 10_000

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll']

export function useIdleLogout() {
  const warningOpen = ref(false)
  const secondsLeft = ref(0)

  let intervalId = null
  let lastWrite = 0
  let signingOut = false

  // 0 disables the whole thing: sessions predating the feature carry no
  // marker, and a company may legitimately not want an idle cut-off.
  const idleMs = computed(() => Number(currentSession.value?.sessionIdleMs) || 0)
  const absoluteExpiry = computed(() => Number(currentSession.value?.sessionAbsoluteExpiry) || 0)

  function readLastActivity() {
    const raw = Number(localStorage.getItem(ACTIVITY_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : Date.now()
  }

  function stampActivity(force = false) {
    const now = Date.now()
    if (!force && now - lastWrite < WRITE_THROTTLE_MS) return
    lastWrite = now
    try {
      localStorage.setItem(ACTIVITY_KEY, String(now))
    } catch {
      // Private-mode or quota — the in-tab timer still works, only the
      // cross-tab handshake is lost. Not worth failing over.
    }
  }

  function onActivity() {
    // While the warning is up, ordinary movement must NOT silently cancel it:
    // the person may be walking past. Dismissing is a deliberate click.
    if (warningOpen.value) return
    stampActivity()
  }

  /** "I'm still here" — reset the clock and clear the warning. */
  function staySignedIn() {
    warningOpen.value = false
    stampActivity(true)
  }

  async function signOutForInactivity() {
    if (signingOut) return
    signingOut = true
    stop()
    warningOpen.value = false
    await logoutCurrentSession({ reason: 'inactivity' })
  }

  function tick() {
    if (!currentSession.value || isPublicRoute(window.location.pathname)) return

    // The absolute cap is independent of activity — when it passes, the server
    // will refuse the next request no matter how busy the user has been.
    if (absoluteExpiry.value && Date.now() > absoluteExpiry.value) {
      signOutForInactivity()
      return
    }

    if (!idleMs.value) return
    const idleFor = Date.now() - readLastActivity()

    if (idleFor >= idleMs.value) {
      signOutForInactivity()
      return
    }
    const untilLogout = idleMs.value - idleFor
    if (untilLogout <= WARN_BEFORE_MS) {
      warningOpen.value = true
      secondsLeft.value = Math.max(0, Math.ceil(untilLogout / 1000))
    } else if (warningOpen.value) {
      // Another tab reported activity — this tab's warning is stale.
      warningOpen.value = false
    }
  }

  function start() {
    if (intervalId) return
    stampActivity(true)
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }
    intervalId = window.setInterval(tick, CHECK_INTERVAL_MS)
  }

  function stop() {
    if (intervalId) window.clearInterval(intervalId)
    intervalId = null
    for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
  }

  onMounted(start)
  onUnmounted(stop)

  return { warningOpen, secondsLeft, staySignedIn, signOutForInactivity }
}
