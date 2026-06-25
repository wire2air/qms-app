/**
 * provideDataTablePersist — wires <DataTable persistKey="…"> view-state
 * persistence to the current user's synced settings bag.
 *
 * Call once near the app root. Every DataTable below it (directly or via the
 * BaseTable adapter) that sets a `persistKey` will persist its density, sort,
 * filters and column visibility/order/pinning to `User.settings` under
 * `tableView:<persistKey>` — IndexedDB + cross-device sync via the syncEngine
 * (NOT localStorage). DataTable injects this adapter under the string key
 * 'qms:dataTableViewPersist' and stays decoupled from the session/model layer.
 *
 * @param {() => boolean} [isReady] gate the user query until the syncEngine's
 *   IndexedDB is installed. At app start the DB connection is null, so querying
 *   the User model too early throws — pass `() => !loading` from the app root.
 */
import { currentSession } from '@/utils/currentSession'

export function provideDataTablePersist(isReady = () => true) {
  // Only query once sync is installed AND a user is known. While either is
  // false the dep is null, so the live query stays idle (no IDB access).
  const user = useLiveQueryWithDeps(
    [() => (isReady() ? (currentSession.value?.userId ?? null) : null)],
    async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
    { models: 'User' },
  )
  const ready = computed(() => user.value !== undefined && user.value !== null)

  function getKey(key) {
    const settings = user.value?.settings
    if (!settings || settings[key] === undefined) return null
    return settings[key]
  }
  async function setKey(key, value) {
    if (!user.value) return
    // Fresh object so the model's dirty-tracking registers the change.
    user.value.settings = { ...(user.value.settings ?? {}), [key]: value }
    await user.value.save()
  }

  provide('qms:dataTableViewPersist', {
    ready,
    get: (key) => getKey(`tableView:${key}`),
    set: (key, value) => setKey(`tableView:${key}`, value),
  })
}
