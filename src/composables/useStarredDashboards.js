/**
 * useStarredDashboards — the analytics dashboards this user has pinned to their
 * home page.
 *
 * Stored as an ordered array of dashboard ids on `users.settings.starredDashboards`
 * (§39), the same synced per-user preference bag that already holds the home
 * page's widget selection and drag order. So a star follows the user across
 * devices, exactly as their widget layout does.
 *
 * ── WHY NOT A TABLE ───────────────────────────────────────────────────────
 * There is no favourite/star/pin table anywhere in this product, and adding one
 * for this would mean a migration, an RLS policy and a model for what is purely
 * client-owned presentation state — the category `useUserSettings` exists for.
 *
 * The one thing that would force a table: needing the server to READ this, e.g.
 * a "most-starred dashboards" admin view. `users.settings` is explicitly never
 * read by the server, so that would need
 * `analytics_dashboard_stars (company_id, dashboard_id, user_id)` with
 * self-only RLS correlated to can_read_analytics_dashboard(). Nothing wants it
 * today; the choice is recorded here so it is deliberate rather than discovered.
 *
 * ── DO NOT COPY useInternalDocs' FAVOURITES ───────────────────────────────
 * That one keeps its ids in localStorage. It is the right call there — the
 * internal docs viewer is a platform-operator tool, not tenant data — but it
 * does not sync, and a dashboard someone stars on their laptop should be
 * starred on their phone.
 *
 * ── ORDER IS MEANINGFUL ───────────────────────────────────────────────────
 * The array order is the chip order, so a new star appends rather than sorting
 * itself somewhere unpredictable. Unstarring preserves the rest.
 *
 * @example
 *   const { starredIds, isStarred, toggleStar } = useStarredDashboards()
 *   <button @click="toggleStar(d.id)">{{ isStarred(d.id) ? 'Starred' : 'Star' }}</button>
 */
import { useUserSettings } from '@/composables/useUserSettings'

const KEY = 'starredDashboards'

export function useStarredDashboards() {
  const { getSetting, setSetting, ready } = useUserSettings()

  /**
   * The stored ids, defensively normalised.
   *
   * `settings` is a free-form jsonb bag that any build — past or future — can
   * write, so this never assumes the value is an array of strings. A malformed
   * value degrades to "nothing starred" instead of throwing inside a computed
   * and blanking the page that renders the chips.
   */
  const starredIds = computed(() => {
    const raw = getSetting(KEY, [])
    if (!Array.isArray(raw)) return []
    return raw.filter((id) => typeof id === 'string' && id.length > 0)
  })

  function isStarred(id) {
    return !!id && starredIds.value.includes(id)
  }

  async function toggleStar(id) {
    if (!id) return
    const current = starredIds.value
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    await setSetting(KEY, next)
  }

  /**
   * Drop ids that no longer resolve.
   *
   * Stale stars are NORMAL here, not exceptional: a starred `shared` board can
   * be flipped back to `private` by its owner, or soft-deleted, and RLS then
   * simply stops serving it — the id in this list becomes a pointer to nothing.
   * The home page prunes on resolve, the same self-healing the widget list
   * already does against its own registry.
   *
   * Writes only when something actually changed, so a normal render does not
   * queue a pointless save on every load.
   */
  async function pruneMissing(liveIds) {
    const live = new Set(liveIds ?? [])
    const current = starredIds.value
    const next = current.filter((id) => live.has(id))
    if (next.length === current.length) return
    await setSetting(KEY, next)
  }

  return { starredIds, isStarred, toggleStar, pruneMissing, ready }
}
